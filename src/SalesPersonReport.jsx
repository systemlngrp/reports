import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'

const fiscalMonths = [
  ['April', 4], ['May', 5], ['June', 6], ['July', 7], ['August', 8], ['September', 9],
  ['October', 10], ['November', 11], ['December', 12], ['January', 1], ['February', 2], ['March', 3],
]

export default function SalesPersonReport({ firms }) {
  const today = new Date().toISOString().slice(0, 10)
  const currentFy = financialYearForDate(today)
  const [financialYear, setFinancialYear] = useState(currentFy)
  const [monthIndex, setMonthIndex] = useState(fiscalMonthForDate(today))
  const [salesPerson, setSalesPerson] = useState('all')
  const [selectedFirms, setSelectedFirms] = useState([])
  const [companies, setCompanies] = useState([])
  const [report, setReport] = useState(null)
  const [status, setStatus] = useState({ loading: true, error: '' })
  const firmFilter = selectedFirms.join('|')
  const asOfDate = monthEnd(financialYear, monthIndex)

  const load = useCallback(async () => {
    setStatus({ loading: true, error: '' })
    try {
      const params = new URLSearchParams({ financialYear, asOfDate })
      if (firmFilter) params.set('firms', firmFilter.split('|').join(','))
      const [companyResponse, reportResponse] = await Promise.all([fetch('/api/companies'), fetch(`/api/reporting/sales-tracker?${params}`)])
      const [companyData, reportData] = await Promise.all([companyResponse.json(), reportResponse.json()])
      if (!companyResponse.ok) throw new Error(companyData.message || 'Unable to load companies.')
      if (!reportResponse.ok) throw new Error(reportData.message || 'Unable to load sales report.')
      setCompanies(companyData); setReport(reportData); setStatus({ loading: false, error: '' })
    } catch (error) { setStatus({ loading: false, error: error.message }) }
  }, [financialYear, asOfDate, firmFilter])

  useEffect(() => { load() }, [load])

  const people = useMemo(() => [...new Set(companies.map((row) => row.salesPerson).filter(Boolean))].sort(), [companies])
  const rows = useMemo(() => {
    if (!report) return []
    const salesByCustomer = new Map(report.customers.map((row) => [normalize(row.customerName), Number(row.months[monthIndex - 1]?.netSales || 0)]))
    return companies
      .filter((company) => salesPerson === 'all' || company.salesPerson === salesPerson)
      .map((company) => {
        const target = Number(company.target || 0)
        const salesAmount = salesByCustomer.get(normalize(company.company)) || 0
        return { ...company, target, salesAmount, variance: salesAmount - target, achievement: target > 0 ? (salesAmount / target) * 100 : null }
      })
      .filter((row) => row.target || row.salesAmount)
      .sort((a, b) => a.salesPerson.localeCompare(b.salesPerson) || b.target - a.target || a.company.localeCompare(b.company))
  }, [companies, report, monthIndex, salesPerson])

  const totals = rows.reduce((value, row) => ({ target: value.target + row.target, sales: value.sales + row.salesAmount }), { target: 0, sales: 0 })
  const monthName = fiscalMonths[monthIndex - 1][0]

  function toggleFirm(name) { setSelectedFirms((current) => current.includes(name) ? current.filter((value) => value !== name) : [...current, name]) }

  async function exportExcel() {
    const { Workbook } = await import('exceljs')
    const workbook = new Workbook(); const sheet = workbook.addWorksheet('Sales Person Wise')
    sheet.addRows([
      ['Sales Person Wise Report', `FY ${financialYear}`, monthName],
      ['Company', 'Sales Person', 'Target', 'Sales Amount', 'Shortfall / Excess', 'Achievement %'],
      ...rows.map((row) => [row.company, row.salesPerson, row.target, row.salesAmount, row.variance, row.achievement ?? 'Not set']),
      ['TOTAL', '', totals.target, totals.sales, totals.sales - totals.target, totals.target ? (totals.sales / totals.target) * 100 : 'Not set'],
    ])
    sheet.columns = [{ width: 42 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 18 }]
    sheet.getRow(2).font = { bold: true }
    const buffer = await workbook.xlsx.writeBuffer(); const url = URL.createObjectURL(new Blob([buffer])); const link = document.createElement('a'); link.href = url; link.download = `sales-person-${financialYear}-${monthName}.xlsx`; link.click(); URL.revokeObjectURL(url)
  }

  return <section className="stack sales-person-report">
    <div className="master-title"><h2>SALES PERSON WISE REPORT</h2><div className="button-row no-print"><button className="secondary-button" onClick={() => window.print()} type="button"><Printer size={15} /> Print / PDF</button><button className="primary-button" disabled={!rows.length} onClick={exportExcel} type="button"><Download size={15} /> Export Excel</button></div></div>
    <div className="panel sales-person-filters no-print">
      <label>Financial Year<select value={financialYear} onChange={(event) => setFinancialYear(event.target.value)}>{financialYearOptions(today).map((year) => <option key={year}>{year}</option>)}</select></label>
      <label>Month<select value={monthIndex} onChange={(event) => setMonthIndex(Number(event.target.value))}>{fiscalMonths.map(([name], index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
      <label>Sales Person<select value={salesPerson} onChange={(event) => setSalesPerson(event.target.value)}><option value="all">All Sales Persons</option>{people.map((person) => <option key={person}>{person}</option>)}</select></label>
      <fieldset><legend>Tally Firms</legend><div className="firm-checks">{firms.filter((firm) => firm.name).map((firm) => <label key={firm.id}><input checked={selectedFirms.includes(firm.name)} onChange={() => toggleFirm(firm.name)} type="checkbox" />{firm.name}</label>)}</div></fieldset>
    </div>
    {status.error && <div className="banner danger">{status.error}</div>}
    {status.loading ? <div className="state-panel"><h2>Preparing sales person report</h2></div> : <>
      <div className="sales-person-summary"><div><span>FY</span><strong>{financialYear}</strong></div><div><span>Month</span><strong>{monthName}</strong></div><div><span>Sales Person</span><strong>{salesPerson === 'all' ? 'All' : salesPerson}</strong></div><div><span>Target</span><strong>{currency(totals.target)}</strong></div><div><span>Sales Amount</span><strong>{currency(totals.sales)}</strong></div><div className={totals.sales - totals.target >= 0 ? 'positive' : 'negative'}><span>Shortfall / Excess</span><strong>{signedCurrency(totals.sales - totals.target)}</strong></div><div><span>Achievement</span><strong>{percent(totals.target ? (totals.sales / totals.target) * 100 : null)}</strong></div></div>
      <div className="company-table-shell"><div className="table-wrap"><table className="sales-person-table"><thead><tr><th>Company Name</th><th>Sales Person</th><th>Target</th><th>Sales Amount</th><th>Shortfall / Excess</th><th>% Achievement</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="customer-name">{row.company}</td><td>{row.salesPerson || 'Not assigned'}</td><td className="num">{currency(row.target)}</td><td className="num">{currency(row.salesAmount)}</td><td className={`num ${row.variance >= 0 ? 'positive-text' : 'negative-text'}`}>{signedCurrency(row.variance)}</td><td className={`num ${row.achievement >= 100 ? 'positive-text' : 'negative-text'}`}>{percent(row.achievement)}</td></tr>)}<tr className="total-row"><td>Total</td><td /><td className="num">{currency(totals.target)}</td><td className="num">{currency(totals.sales)}</td><td className="num">{signedCurrency(totals.sales - totals.target)}</td><td className="num">{percent(totals.target ? (totals.sales / totals.target) * 100 : null)}</td></tr>{!rows.length && <tr><td colSpan="6">No matching companies with a target or sales amount.</td></tr>}</tbody></table></div></div>
    </>}
  </section>
}

function normalize(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN') }
function currency(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0)) }
function signedCurrency(value) { return `${value >= 0 ? '+' : ''}${currency(value)}` }
function percent(value) { return value === null || value === undefined ? 'Not set' : `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%` }
function financialYearForDate(value) { const [year, month] = value.split('-').map(Number); const start = month >= 4 ? year : year - 1; return `${start}-${String(start + 1).slice(-2)}` }
function fiscalMonthForDate(value) { const month = Number(value.split('-')[1]); return month >= 4 ? month - 3 : month + 9 }
function financialYearOptions(value) { const current = Number(financialYearForDate(value).slice(0, 4)); return Array.from({ length: 8 }, (_, index) => { const start = current + 2 - index; return `${start}-${String(start + 1).slice(-2)}` }) }
function monthEnd(financialYear, fiscalIndex) { const start = Number(financialYear.slice(0, 4)); const calendarMonth = fiscalMonths[fiscalIndex - 1][1]; const year = calendarMonth >= 4 ? start : start + 1; return new Date(Date.UTC(year, calendarMonth, 0)).toISOString().slice(0, 10) }
