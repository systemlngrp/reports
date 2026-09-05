import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, RotateCcw, Search } from 'lucide-react'

const pageSize = 50
const columns = [
  ['mainAccount', 'Main Account'], ['date', 'Dated'], ['amount', 'Amount'], ['narration', 'Narration'],
  ['invoiceReference', 'Original Invoice'], ['voucherNo', 'Credit Note No.'], ['dealingPerson', 'Dealing Person'],
  ['refPerson', 'Ref. Person'], ['month', 'Month'], ['financialYear', 'FY'],
]

export default function CreditNoteReport({ firms }) {
  const today = new Date().toISOString().slice(0, 10)
  const initial = { firm: firms.find((row) => row.name)?.name || '', financialYear: financialYear(today), month: monthName(today), dealingPerson: '', refPerson: '', search: '' }
  const [filters, setFilters] = useState(initial), [report, setReport] = useState(null), [status, setStatus] = useState({ loading: true, error: '' })
  const [sort, setSort] = useState({ key: 'date', direction: -1 }), [page, setPage] = useState(1)
  const load = useCallback(async () => {
    setStatus({ loading: true, error: '' })
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)))
      const response = await fetch(`/api/reporting/credit-notes?${params}`); const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Unable to load credit notes.')
      setReport(data); setStatus({ loading: false, error: '' })
    } catch (error) { setStatus({ loading: false, error: error.message }) }
  }, [filters])
  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [filters, sort])
  const sortedRows = useMemo(() => [...(report?.rows || [])].sort((a, b) => compare(a[sort.key], b[sort.key]) * sort.direction), [report, sort])
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize)), visible = sortedRows.slice((page - 1) * pageSize, page * pageSize)
  function update(key, value) { setFilters((current) => ({ ...current, [key]: value })) }
  function changeSort(key) { setSort((current) => ({ key, direction: current.key === key ? -current.direction : 1 })) }
  function reset() { setFilters({ ...initial, firm: filters.firm }) }
  async function exportExcel() {
    const { Workbook } = await import('exceljs'); const workbook = new Workbook(); const sheet = workbook.addWorksheet('Credit Notes')
    sheet.addRows([['Credit Note Report'], [`Firm: ${filters.firm || 'All Firms'}`, `FY: ${filters.financialYear || 'All'}`, `Month: ${filters.month || 'All'}`], [], columns.map(([, label]) => label), ...sortedRows.map((row) => columns.map(([key]) => key === 'date' && row[key] ? new Date(`${row[key]}T00:00:00Z`) : key === 'invoiceReference' ? row[key] || 'Not available' : row[key] ?? '')), ['TOTAL', '', report.summary.totalAmount]])
    sheet.mergeCells('A1:J1'); sheet.getRow(1).font = { bold: true, size: 15 }; sheet.getRow(4).font = { bold: true }; sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } }; sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }]
    sheet.columns = columns.map(([, label], index) => ({ key: label, width: index === 0 ? 34 : index === 3 ? 42 : 18 })); for (let row = 5; row <= sheet.rowCount; row += 1) { sheet.getCell(row, 2).numFmt = 'dd-mmm-yyyy'; sheet.getCell(row, 3).numFmt = '#,##0.00' }
    const buffer = await workbook.xlsx.writeBuffer(); const url = URL.createObjectURL(new Blob([buffer])); const link = document.createElement('a'); link.href = url; link.download = `credit-notes-${filters.firm || 'all'}-${filters.financialYear || 'all'}.xlsx`; link.click(); URL.revokeObjectURL(url)
  }
  const options = report?.options || { firms: [], financialYears: [], months: [], dealingPeople: [], refPeople: [] }
  return <section className="stack credit-note-report"><div className="master-title"><div><h2>CREDIT NOTE REPORT</h2><p>Detailed customer credit-note register with original invoice allocations.</p></div><button className="primary-button" disabled={!report?.rows.length} onClick={exportExcel} type="button"><Download size={15} /> Export Excel</button></div>
    <div className="panel credit-note-filters"><Select label="Firm" value={filters.firm} values={firms.filter((row) => row.name).map((row) => row.name)} onChange={(value) => update('firm', value)} all="All Firms" /><Select label="Financial Year" value={filters.financialYear} values={unique([filters.financialYear, ...options.financialYears])} onChange={(value) => update('financialYear', value)} all="All Years" /><Select label="Month" value={filters.month} values={unique([filters.month, ...options.months], false)} onChange={(value) => update('month', value)} all="All Months" /><Select label="Dealing Person" value={filters.dealingPerson} values={options.dealingPeople} onChange={(value) => update('dealingPerson', value)} all="All Dealing Persons" /><Select label="Ref. Person" value={filters.refPerson} values={options.refPeople} onChange={(value) => update('refPerson', value)} all="All Ref. Persons" />
      <label className="credit-search">Search<div><Search size={14} /><input value={filters.search} onChange={(event) => update('search', event.target.value)} placeholder="Customer, invoice or narration" /></div></label><button className="secondary-button" onClick={reset} type="button"><RotateCcw size={14} /> Reset</button></div>
    {status.error && <div className="banner danger">{status.error}</div>}{report?.unmatched.length > 0 && <div className="banner info">Unmatched company ledgers ({report.unmatched.length}): {report.unmatched.slice(0, 8).join(', ')}{report.unmatched.length > 8 ? '…' : ''}</div>}
    <div className="credit-note-kpis"><Kpi label="Filtered Rows" value={report?.summary.rowCount || 0} /><Kpi label="Credit Note Amount" value={currency(report?.summary.totalAmount)} /><Kpi label="Customers" value={report?.summary.customerCount || 0} /></div>
    {status.loading ? <div className="state-panel"><h2>Preparing credit-note report</h2></div> : <div className="company-table-shell credit-note-shell"><div className="table-wrap"><table className="credit-note-table"><thead><tr>{columns.map(([key, label]) => <th key={key}><button onClick={() => changeSort(key)} type="button">{label}{sort.key === key ? sort.direction > 0 ? ' ▲' : ' ▼' : ''}</button></th>)}</tr></thead><tbody>{visible.map((row) => <tr key={row.id}><td>{row.mainAccount}</td><td>{displayDate(row.date)}</td><td className="num">{number(row.amount)}</td><td className="narration-cell">{row.narration || '—'}</td><td>{row.invoiceReference || 'Not available'}</td><td>{row.voucherNo || '—'}</td><td>{row.dealingPerson || 'Not assigned'}</td><td>{row.refPerson || 'Not assigned'}</td><td>{row.month}</td><td>{row.financialYear}</td></tr>)}<tr className="total-row"><td>TOTAL CREDIT NOTES</td><td /><td className="num">{number(report?.summary.totalAmount)}</td><td colSpan="7" /></tr>{!visible.length && <tr><td colSpan="10">No credit notes match the selected filters.</td></tr>}</tbody></table></div><div className="company-pager"><span>Showing {visible.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, sortedRows.length)} of {sortedRows.length}</span><div><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} type="button">Prev</button><strong>Page {page} / {totalPages}</strong><button disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} type="button">Next</button></div></div></div>}
  </section>
}

function Select({ label, value, values, onChange, all }) { return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{all}</option>{values.map((item) => <option key={item}>{item}</option>)}</select></label> }
function unique(values, sort = true) { const result = [...new Set(values.filter(Boolean))]; return sort ? result.sort() : result }
function Kpi({ label, value }) { return <div className="company-stat"><span>{label}</span><strong>{value}</strong></div> }
function financialYear(value) { const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), start = month >= 4 ? year : year - 1; return `${start}-${String(start + 1).slice(-2)}` }
function monthName(value) { return new Date(`${value}T00:00:00Z`).toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' }) }
function compare(a, b) { return typeof a === 'number' || typeof b === 'number' ? Number(a || 0) - Number(b || 0) : String(a || '').localeCompare(String(b || '')) }
function number(value) { return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) }
function currency(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0)) }
function displayDate(value) { return value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN') : '—' }
