import { useEffect, useMemo, useState } from 'react'
import { Download, RotateCcw, Search } from 'lucide-react'

const pageSize = 50
const months = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March']
const columns = [['date', 'Date'], ['debtor', 'Company Name'], ['item', 'Item Name'], ['qty', 'Sold Quantity']]

export default function ItemWiseSales({ firms, rows }) {
  const firmNames = useMemo(() => [...new Set(firms.map((firm) => firm.name).filter(Boolean))], [firms])
  const [activeFirm, setActiveFirm] = useState(() => firmNames[0] || '')
  const today = new Date().toISOString().slice(0, 10)
  const defaults = { financialYear: financialYear(today), month: '', search: '' }
  const [filters, setFilters] = useState(defaults)
  const [sort, setSort] = useState({ key: 'date', direction: 1 })
  const [page, setPage] = useState(1)

  useEffect(() => { if (!firmNames.includes(activeFirm)) setActiveFirm(firmNames[0] || '') }, [activeFirm, firmNames])
  useEffect(() => { setPage(1) }, [activeFirm, filters, sort])

  const itemRows = useMemo(() => rows.filter((row) => row.item && (!activeFirm || row.firm === activeFirm)).map((row) => ({ ...row, month: monthName(row.date), financialYear: financialYear(row.date) })), [activeFirm, rows])
  const financialYears = useMemo(() => [...new Set(itemRows.map((row) => row.financialYear).filter(Boolean))].sort().reverse(), [itemRows])
  const filtered = useMemo(() => {
    const search = filters.search.trim().toLocaleLowerCase('en-IN')
    return itemRows.filter((row) => (!filters.financialYear || row.financialYear === filters.financialYear) && (!filters.month || row.month === filters.month) && (!search || [row.debtor, row.item, row.invoiceNo].some((value) => String(value || '').toLocaleLowerCase('en-IN').includes(search))))
  }, [filters, itemRows])
  const sorted = useMemo(() => [...filtered].sort((a, b) => compare(a[sort.key], b[sort.key]) * sort.direction), [filtered, sort])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const visible = sorted.slice((page - 1) * pageSize, page * pageSize)
  const totalQuantity = filtered.reduce((sum, row) => sum + Number(row.qty || 0), 0)

  function update(key, value) { setFilters((current) => ({ ...current, [key]: value })) }
  function reset() { setFilters(defaults) }
  function changeSort(key) { setSort((current) => ({ key, direction: current.key === key ? -current.direction : 1 })) }
  async function exportExcel() {
    const { Workbook } = await import('exceljs'); const workbook = new Workbook(); const sheet = workbook.addWorksheet(safeSheetName(activeFirm))
    sheet.addRows([['Item Wise Sales'], [`Firm: ${activeFirm}`, `FY: ${filters.financialYear || 'All'}`, `Month: ${filters.month || 'All'}`], [], columns.map(([, label]) => label), ...sorted.map((row) => [new Date(`${row.date}T00:00:00Z`), row.debtor, row.item, Number(row.qty || 0)]), ['TOTAL', '', '', totalQuantity]])
    sheet.mergeCells('A1:D1'); sheet.getRow(1).font = { bold: true, size: 15 }; sheet.getRow(4).font = { bold: true }; sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } }; sheet.views = [{ state: 'frozen', ySplit: 4 }]
    sheet.columns = [{ width: 15 }, { width: 42 }, { width: 75 }, { width: 18 }]
    for (let row = 5; row <= sheet.rowCount; row += 1) { sheet.getCell(row, 1).numFmt = 'dd-mmm-yyyy'; sheet.getCell(row, 4).numFmt = '#,##0.###' }
    const buffer = await workbook.xlsx.writeBuffer(); const url = URL.createObjectURL(new Blob([buffer])); const link = document.createElement('a'); link.href = url; link.download = `item-wise-sales-${fileName(activeFirm)}-${filters.financialYear || 'all'}.xlsx`; link.click(); URL.revokeObjectURL(url)
  }

  if (!firmNames.length) return <section className="stack item-wise-sales"><div className="state-panel"><h2>No firms configured</h2><p>Add a named firm to create its item-sales tab.</p></div></section>

  return <section className="stack item-wise-sales">
    <div className="item-wise-toolbar"><div><strong>{filtered.length} entries</strong><span>{formatNumber(totalQuantity)} sold quantity</span></div><button className="primary-button" disabled={!filtered.length} onClick={exportExcel} type="button"><Download size={15} /> Export Excel</button></div>
    <div className="credit-firm-tabs" role="tablist" aria-label="Sales firms">{firmNames.map((firm) => <button aria-selected={firm === activeFirm} className={firm === activeFirm ? 'active' : ''} key={firm} onClick={() => setActiveFirm(firm)} role="tab" type="button">{firm}</button>)}</div>
    <div className="item-wise-filters"><label>Financial Year<select value={filters.financialYear} onChange={(event) => update('financialYear', event.target.value)}><option value="">All Years</option>{[...new Set([filters.financialYear, ...financialYears].filter(Boolean))].map((year) => <option key={year}>{year}</option>)}</select></label><label>Month<select value={filters.month} onChange={(event) => update('month', event.target.value)}><option value="">All Months</option>{months.map((month) => <option key={month}>{month}</option>)}</select></label><label className="credit-search">Search<div><Search size={14} /><input value={filters.search} onChange={(event) => update('search', event.target.value)} placeholder="Company, item or invoice" /></div></label><button className="secondary-button" onClick={reset} type="button"><RotateCcw size={14} /> Reset</button></div>
    <div className="company-table-shell item-wise-shell"><div className="table-wrap"><table className="item-wise-table"><thead><tr>{columns.map(([key, label]) => <th key={key}><button onClick={() => changeSort(key)} type="button">{label}{sort.key === key ? sort.direction > 0 ? ' ▲' : ' ▼' : ''}</button></th>)}</tr></thead><tbody>{visible.map((row) => <tr key={row.id}><td>{displayDate(row.date)}</td><td>{row.debtor || '—'}</td><td>{row.item}</td><td className="num">{formatNumber(row.qty)}</td></tr>)}<tr className="total-row"><td>TOTAL</td><td /><td /><td className="num">{formatNumber(totalQuantity)}</td></tr>{!visible.length && <tr><td colSpan="4">No item sales match the selected filters.</td></tr>}</tbody></table></div><div className="company-pager"><span>Showing {visible.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, sorted.length)} of {sorted.length}</span><div><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} type="button">Prev</button><strong>Page {page} / {totalPages}</strong><button disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} type="button">Next</button></div></div></div>
  </section>
}

function financialYear(value) { if (!value) return ''; const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), start = month >= 4 ? year : year - 1; return `${start}-${String(start + 1).slice(-2)}` }
function monthName(value) { return value ? new Date(`${value}T00:00:00Z`).toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' }) : '' }
function compare(a, b) { return typeof a === 'number' || typeof b === 'number' ? Number(a || 0) - Number(b || 0) : String(a || '').localeCompare(String(b || '')) }
function displayDate(value) { return value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN') : '—' }
function formatNumber(value) { return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 }) }
function safeSheetName(value) { return String(value || 'Item Sales').replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Item Sales' }
function fileName(value) { return String(value || 'firm').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'firm' }
