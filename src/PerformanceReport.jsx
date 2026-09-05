import { useCallback, useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'

const months = [['April', 4], ['May', 5], ['June', 6], ['July', 7], ['August', 8], ['September', 9], ['October', 10], ['November', 11], ['December', 12], ['January', 1], ['February', 2], ['March', 3]]

export default function PerformanceReport({ firms }) {
  const today = new Date().toISOString().slice(0, 10)
  const [firm, setFirm] = useState('')
  const [financialYear, setFinancialYear] = useState(financialYearForDate(today))
  const [monthIndex, setMonthIndex] = useState(fiscalMonthForDate(today))
  const [companies, setCompanies] = useState([])
  const [report, setReport] = useState(null)
  const [status, setStatus] = useState({ loading: false, error: '' })
  const asOfDate = monthEnd(financialYear, monthIndex)

  const load = useCallback(async () => {
    if (!firm) { setReport(null); return }
    setStatus({ loading: true, error: '' })
    try {
      const params = new URLSearchParams({ financialYear, asOfDate, firms: firm })
      const [companiesResponse, reportResponse] = await Promise.all([fetch('/api/companies'), fetch(`/api/reporting/sales-tracker?${params}`)])
      const [companyData, reportData] = await Promise.all([companiesResponse.json(), reportResponse.json()])
      if (!companiesResponse.ok) throw new Error(companyData.message || 'Unable to load companies.')
      if (!reportResponse.ok) throw new Error(reportData.message || 'Unable to load performance.')
      setCompanies(companyData); setReport(reportData); setStatus({ loading: false, error: '' })
    } catch (error) { setStatus({ loading: false, error: error.message }) }
  }, [firm, financialYear, asOfDate])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    if (!report) return []
    const companyMap = new Map(companies.map((row) => [normalize(row.company), row]))
    const reportMap = new Map(report.customers.map((row) => [normalize(row.customerName), row]))
    const keys = new Set([...companyMap.keys(), ...reportMap.keys()])
    return [...keys].map((key) => {
      const company = companyMap.get(key); const customer = reportMap.get(key)
      const target = Number(company?.target || 0); const month = customer?.months[monthIndex - 1]
      const grossSales = Number(month?.grossSales || 0); const creditNotes = Number(month?.creditNotes || 0); const netSales = Number(month?.netSales || 0)
      return { key, name: company?.company || customer?.customerName, salesPerson: company?.salesPerson || '', target, grossSales, creditNotes, netSales, variance: netSales - target, achievement: target > 0 ? (netSales / target) * 100 : null }
    }).filter((row) => row.target || row.grossSales || row.creditNotes).sort((a, b) => b.netSales - a.netSales || a.name.localeCompare(b.name))
  }, [companies, report, monthIndex])

  const totals = rows.reduce((sum, row) => ({ gross: sum.gross + row.grossSales, credits: sum.credits + row.creditNotes, net: sum.net + row.netSales, target: sum.target + row.target }), { gross: 0, credits: 0, net: 0, target: 0 })

  return <section className="stack performance-report">
    <div className="master-title"><h2>FIRM PERFORMANCE REPORT</h2><button className="secondary-button no-print" onClick={() => window.print()} type="button"><Printer size={15} /> Print / PDF</button></div>
    <div className="panel performance-filters no-print"><label>Firm<select value={firm} onChange={(event) => setFirm(event.target.value)}><option value="">Select Firm</option>{firms.filter((row) => row.name).map((row) => <option key={row.id}>{row.name}</option>)}</select></label><label>Financial Year<select value={financialYear} onChange={(event) => setFinancialYear(event.target.value)}>{financialYearOptions(today).map((year) => <option key={year}>{year}</option>)}</select></label><label>Month<select value={monthIndex} onChange={(event) => setMonthIndex(Number(event.target.value))}>{months.map(([name], index) => <option key={name} value={index + 1}>{name}</option>)}</select></label></div>
    {!firm && <div className="state-panel"><h2>Select a Firm</h2><p>Choose one Tally firm to view its customer performance.</p></div>}
    {status.error && <div className="banner danger">{status.error}</div>}
    {status.loading && <div className="state-panel"><h2>Preparing performance report</h2></div>}
    {!status.loading && firm && report && <><div className="performance-kpis"><Kpi label="Gross Sales" value={money(totals.gross)} /><Kpi label="Credit Notes" value={money(totals.credits)} /><Kpi label="Net Sales" value={money(totals.net)} /><Kpi label="Target" value={money(totals.target)} /><Kpi label="Shortfall / Excess" value={signed(totals.net - totals.target)} tone={totals.net >= totals.target ? 'positive' : 'negative'} /><Kpi label="Achievement" value={percentage(totals.target ? totals.net / totals.target * 100 : null)} /></div>
      <div className="company-table-shell"><div className="table-wrap"><table className="performance-table"><thead><tr><th>Company</th><th>Sales Person</th><th>Target</th><th>Gross Sales</th><th>Credit Notes</th><th>Net Sales</th><th>Shortfall / Excess</th><th>% Achievement</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key}><td className="customer-name">{row.name}</td><td>{row.salesPerson || 'Not assigned'}</td><td className="num">{money(row.target)}</td><td className="num">{money(row.grossSales)}</td><td className="num">{money(row.creditNotes)}</td><td className="num">{money(row.netSales)}</td><td className={`num ${row.variance >= 0 ? 'positive-text' : 'negative-text'}`}>{signed(row.variance)}</td><td className={`num ${row.achievement >= 100 ? 'positive-text' : 'negative-text'}`}>{percentage(row.achievement)}</td></tr>)}<tr className="total-row"><td>Total</td><td /><td className="num">{money(totals.target)}</td><td className="num">{money(totals.gross)}</td><td className="num">{money(totals.credits)}</td><td className="num">{money(totals.net)}</td><td className="num">{signed(totals.net - totals.target)}</td><td className="num">{percentage(totals.target ? totals.net / totals.target * 100 : null)}</td></tr>{!rows.length && <tr><td colSpan="8">No performance data found for this firm and month.</td></tr>}</tbody></table></div></div></>}
  </section>
}

function Kpi({ label, value, tone = '' }) { return <div className={`company-stat ${tone}`}><span>{label}</span><strong>{value}</strong></div> }
function normalize(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN') }
function money(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0)) }
function signed(value) { return `${value >= 0 ? '+' : ''}${money(value)}` }
function percentage(value) { return value === null || value === undefined ? 'Not set' : `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%` }
function financialYearForDate(value) { const [year, month] = value.split('-').map(Number); const start = month >= 4 ? year : year - 1; return `${start}-${String(start + 1).slice(-2)}` }
function fiscalMonthForDate(value) { const month = Number(value.split('-')[1]); return month >= 4 ? month - 3 : month + 9 }
function financialYearOptions(value) { const current = Number(financialYearForDate(value).slice(0, 4)); return Array.from({ length: 8 }, (_, index) => { const start = current + 2 - index; return `${start}-${String(start + 1).slice(-2)}` }) }
function monthEnd(financialYear, fiscalIndex) { const start = Number(financialYear.slice(0, 4)); const calendarMonth = months[fiscalIndex - 1][1]; const year = calendarMonth >= 4 ? start : start + 1; return new Date(Date.UTC(year, calendarMonth, 0)).toISOString().slice(0, 10) }
