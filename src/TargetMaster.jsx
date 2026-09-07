import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'

const months = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March']

export default function TargetMaster({ firms }) {
  const [data, setData] = useState({ customers: [], salesmen: [], weekly: [] })
  const [type, setType] = useState('salesmen'), [financialYear, setFinancialYear] = useState(''), [firm, setFirm] = useState(''), [search, setSearch] = useState('')
  const [status, setStatus] = useState({ loading: true, error: '' })
  const load = useCallback(async () => {
    setStatus({ loading: true, error: '' })
    try {
      const responses = await Promise.all([fetch('/api/reporting/targets'), fetch('/api/reporting/sales-person-targets'), fetch('/api/reporting/weekly-sales-targets')])
      const values = await Promise.all(responses.map((response) => response.json()))
      const failed = responses.findIndex((response) => !response.ok); if (failed >= 0) throw new Error(values[failed].message || 'Unable to load saved targets.')
      setData({ customers: groupMonthly(values[0], 'customerKey', 'customerName'), salesmen: groupMonthly(values[1], 'salesPerson', 'salesPerson'), weekly: values[2] })
      setStatus({ loading: false, error: '' })
    } catch (error) { setStatus({ loading: false, error: error.message }) }
  }, [])
  useEffect(() => { load() }, [load])
  const years = useMemo(() => [...new Set([...data.customers.map((row) => row.financialYear), ...data.salesmen.map((row) => row.financialYear), ...data.weekly.map((row) => fy(row.startDate))].filter(Boolean))].sort().reverse(), [data])
  const query = search.trim().toLocaleLowerCase('en-IN')
  const rows = useMemo(() => {
    const source = data[type]
    return source.filter((row) => (!financialYear || (row.financialYear || fy(row.startDate)) === financialYear) && (!firm || row.firm === firm) && (!query || [row.name, row.salesPerson, row.firm, row.startDate, row.endDate].some((value) => String(value || '').toLocaleLowerCase('en-IN').includes(query))))
  }, [data, financialYear, firm, query, type])
  const total = rows.reduce((sum, row) => sum + Number(row.total ?? row.amount ?? 0), 0)
  function clear() { setFinancialYear(''); setFirm(''); setSearch('') }
  return <section className="stack target-master-page">
    <div className="target-master-toolbar"><div><strong>{rows.length} saved records</strong><span>{money(total)} total</span></div><button className="secondary-button" disabled={status.loading} onClick={load} type="button"><RefreshCw size={14} /> Refresh</button></div>
    <div className="target-master-tabs">{[['salesmen', 'Salesman Targets'], ['customers', 'Customer Targets'], ['weekly', 'Weekly Targets']].map(([key, label]) => <button className={type === key ? 'active' : ''} key={key} onClick={() => setType(key)} type="button">{label}</button>)}</div>
    <div className="target-master-filters"><label>Financial Year<select value={financialYear} onChange={(event) => setFinancialYear(event.target.value)}><option value="">All Years</option>{years.map((year) => <option key={year}>{year}</option>)}</select></label>{type !== 'customers' && <label>Firm<select value={firm} onChange={(event) => setFirm(event.target.value)}><option value="">All Firms</option>{firms.filter((row) => row.name).map((row) => <option key={row.id}>{row.name}</option>)}</select></label>}<label className="credit-search">Search<div><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer or salesman" /></div></label><button className="secondary-button" onClick={clear} type="button">Clear</button></div>
    {status.error && <div className="banner danger">{status.error}</div>}
    {status.loading ? <div className="state-panel"><h2>Loading target master</h2></div> : type === 'weekly' ? <WeeklyTable rows={rows} total={total} /> : <MonthlyTable rows={rows} total={total} type={type} />}
  </section>
}

function MonthlyTable({ rows, total, type }) { return <div className="company-table-shell target-master-shell"><div className="table-wrap"><table className="target-master-table"><thead><tr>{type === 'salesmen' && <th>Firm</th>}<th>{type === 'salesmen' ? 'Salesman' : 'Customer'}</th><th>FY</th>{months.map((month) => <th key={month}>{month}</th>)}<th>Annual Total</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key}>{type === 'salesmen' && <td>{row.firm}</td>}<td className="customer-name">{row.name}</td><td>{row.financialYear}</td>{row.months.map((amount, index) => <td className="num" key={months[index]}>{money(amount)}</td>)}<td className="num"><strong>{money(row.total)}</strong></td></tr>)}<tr className="total-row"><td colSpan={type === 'salesmen' ? 15 : 14}>TOTAL SAVED TARGET</td><td className="num">{money(total)}</td></tr>{!rows.length && <tr><td colSpan={type === 'salesmen' ? 16 : 15}>No saved targets match these filters.</td></tr>}</tbody></table></div></div> }
function WeeklyTable({ rows, total }) { return <div className="company-table-shell target-master-shell"><div className="table-wrap"><table><thead><tr><th>Firm</th><th>Salesman</th><th>Financial Year</th><th>Start Date</th><th>End Date</th><th>Target</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.firm}</td><td>{row.salesPerson}</td><td>{fy(row.startDate)}</td><td>{date(row.startDate)}</td><td>{date(row.endDate)}</td><td className="num">{money(row.amount)}</td></tr>)}<tr className="total-row"><td colSpan="5">TOTAL SAVED TARGET</td><td className="num">{money(total)}</td></tr>{!rows.length && <tr><td colSpan="6">No saved weekly targets match these filters.</td></tr>}</tbody></table></div></div> }
function groupMonthly(rows, keyField, nameField) { const grouped = new Map(); rows.forEach((row) => { const key = `${row.firm || ''}\0${row[keyField]}\0${row.financialYear}`; if (!grouped.has(key)) grouped.set(key, { key, firm: row.firm || '', name: row[nameField], financialYear: row.financialYear, months: Array(12).fill(0), total: 0 }); const item = grouped.get(key), amount = Number(row.amount || 0); item.months[Number(row.fiscalMonth) - 1] = amount; item.total += amount }); return [...grouped.values()].sort((a, b) => b.financialYear.localeCompare(a.financialYear) || a.name.localeCompare(b.name)) }
function fy(value) { if (!value) return ''; const [year, month] = value.split('-').map(Number), start = month >= 4 ? year : year - 1; return `${start}-${String(start + 1).slice(-2)}` }
function money(value) { return Number(value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) }
function date(value) { return value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN') : '—' }
