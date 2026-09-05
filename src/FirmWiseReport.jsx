import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'

const columns = [
  ['dealingPerson', 'Dealing Person'], ['refPerson', 'Ref. Person'], ['company', 'Company'], ['target', 'Sales Target'],
  ['fySales', 'Total Sales from FY Start'], ['previousMonthSales', 'Previous Month Sale'], ['selectedMonthSales', 'Sales in Selected Month'],
  ['collections', 'Collection in Selected Month'], ['achievement', 'Month % Achieved'], ['totalDues', 'Current Total Dues'],
  ['notDue', 'Current Not Due'], ['overdue', 'Overdues'], ['upcoming', 'Upcoming Overdues (Next 7 Days)'], ['onAccountReceipts', 'On Account Receipt'],
]
const moneyKeys = new Set(['target', 'fySales', 'previousMonthSales', 'selectedMonthSales', 'collections', 'totalDues', 'notDue', 'overdue', 'upcoming', 'onAccountReceipts'])

export default function FirmWiseReport({ firms }) {
  const today = new Date().toISOString().slice(0, 10)
  const [firm, setFirm] = useState(firms.find((row) => row.name)?.name || ''), [asOfDate, setAsOfDate] = useState(today)
  const [dealingPerson, setDealingPerson] = useState(''), [refPerson, setRefPerson] = useState(''), [report, setReport] = useState(null)
  const [people, setPeople] = useState({ dealing: [], ref: [] }), [sort, setSort] = useState({ key: 'company', direction: 1 })
  const [status, setStatus] = useState({ loading: false, refreshing: false, error: '', message: '' })
  const selectedFirm = firms.find((row) => row.name === firm)
  const load = useCallback(async () => {
    if (!firm) return setReport(null)
    setStatus((current) => ({ ...current, loading: true, error: '' }))
    try {
      const params = new URLSearchParams({ firm, asOfDate }); if (dealingPerson) params.set('dealingPerson', dealingPerson); if (refPerson) params.set('refPerson', refPerson)
      const data = await api(`/api/reporting/firm-wise?${params}`); setReport(data)
      if (!dealingPerson && !refPerson) setPeople({ dealing: unique(data.rows.map((row) => row.dealingPerson)), ref: unique(data.rows.map((row) => row.refPerson)) })
      setStatus((current) => ({ ...current, loading: false }))
    } catch (error) { setStatus({ loading: false, refreshing: false, error: error.message, message: '' }) }
  }, [firm, asOfDate, dealingPerson, refPerson])
  useEffect(() => { load() }, [load])
  const rows = useMemo(() => [...(report?.rows || [])].sort((a, b) => compare(a[sort.key], b[sort.key]) * sort.direction), [report, sort])
  function changeSort(key) { setSort((current) => ({ key, direction: current.key === key ? -current.direction : 1 })) }
  async function refreshOutstanding() {
    if (!selectedFirm) return
    setStatus((current) => ({ ...current, refreshing: true, error: '', message: '' }))
    try { const result = await api('/api/tally/outstanding/fetch', { method: 'POST', body: { firmId: selectedFirm.id, asOfDate } }); setStatus({ loading: false, refreshing: false, error: '', message: result.message }); await load() }
    catch (error) { setStatus({ loading: false, refreshing: false, error: error.message, message: '' }) }
  }
  async function exportExcel() {
    if (!report) return
    const { Workbook } = await import('exceljs'); const workbook = new Workbook(); const sheet = workbook.addWorksheet('Firm Wise Report')
    sheet.addRows([[`${firm} - Firm Wise Report`], [`As of ${asOfDate}`, `FY ${report.financialYear}`], [], columns.map(([, label]) => label), ...rows.map((row) => columns.map(([key]) => row[key] ?? '')), ['TOTAL', '', '', ...columns.slice(3).map(([key]) => report.totals[key] ?? '')]])
    sheet.mergeCells('A1:N1'); sheet.getRow(1).font = { bold: true, size: 15 }; sheet.getRow(4).font = { bold: true, color: { argb: 'FF000000' } }; sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF20DCE0' } }; sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 4 }]
    sheet.columns = columns.map(([, label], index) => ({ header: label, width: index === 2 ? 36 : 18 })); for (let row = 5; row <= sheet.rowCount; row += 1) for (let col = 4; col <= 14; col += 1) sheet.getCell(row, col).numFmt = col === 9 ? '0.0%' : '#,##0.00'
    const buffer = await workbook.xlsx.writeBuffer(); const url = URL.createObjectURL(new Blob([buffer])); const link = document.createElement('a'); link.href = url; link.download = `firm-wise-${firm}-${asOfDate}.xlsx`; link.click(); URL.revokeObjectURL(url)
  }
  return <section className="stack firm-wise-report"><div className="master-title"><div><h2>FIRM WISE REPORT</h2><p>Sales, collections, targets and receivable ageing as of {asOfDate}.</p></div><div className="button-row no-print"><button className="secondary-button" disabled={!selectedFirm || status.refreshing} onClick={refreshOutstanding} type="button"><RefreshCw size={15} /> {status.refreshing ? 'Refreshing…' : 'Refresh Outstanding'}</button><button className="primary-button" disabled={!report} onClick={exportExcel} type="button"><Download size={15} /> Export Excel</button></div></div>
    <div className="panel firm-wise-filters no-print"><label>Firm<select value={firm} onChange={(event) => { setFirm(event.target.value); setDealingPerson(''); setRefPerson('') }}><option value="">Select Firm</option>{firms.filter((row) => row.name).map((row) => <option key={row.id}>{row.name}</option>)}</select></label><label>As-of Date<input max={today} type="date" value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} /></label><label>Dealing Person<select value={dealingPerson} onChange={(event) => setDealingPerson(event.target.value)}><option value="">All Dealing Persons</option>{people.dealing.map((name) => <option key={name}>{name}</option>)}</select></label><label>Ref. Person<select value={refPerson} onChange={(event) => setRefPerson(event.target.value)}><option value="">All Ref. Persons</option>{people.ref.map((name) => <option key={name}>{name}</option>)}</select></label></div>
    {status.error && <div className="banner danger">{status.error}</div>}{status.message && <div className="banner success">{status.message}</div>}{report && !report.snapshotAt && <div className="banner info">No outstanding snapshot exists for this date. Use Refresh Outstanding while Tally is running.</div>}{report?.unmatched.length > 0 && <div className="banner info">Unmatched ledgers ({report.unmatched.length}): {report.unmatched.slice(0, 8).join(', ')}{report.unmatched.length > 8 ? '…' : ''}</div>}
    {status.loading ? <div className="state-panel"><h2>Preparing firm-wise report</h2></div> : report && <div className="company-table-shell firm-wise-shell"><div className="firm-wise-meta"><strong>{firm} Total</strong><span>{rows.length} customers</span><span>Snapshot: {report.snapshotAt || 'Not refreshed'}</span></div><div className="table-wrap"><table className="firm-wise-table"><thead><tr>{columns.map(([key, label]) => <th key={key}><button onClick={() => changeSort(key)} type="button">{label}{sort.key === key ? (sort.direction > 0 ? ' ▲' : ' ▼') : ''}</button></th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.key}>{columns.map(([key]) => <td className={`${moneyKeys.has(key) || key === 'achievement' ? 'num' : ''} ${key === 'achievement' ? achievementClass(row[key]) : key === 'overdue' && row[key] > 0 ? 'negative-text' : ''}`} key={key}>{formatCell(key, row[key])}</td>)}</tr>)}<tr className="total-row"><td>FIRM TOTAL</td><td /><td /><td className="num">{money(report.totals.target)}</td>{columns.slice(4).map(([key]) => <td className="num" key={key}>{formatCell(key, report.totals[key])}</td>)}</tr>{!rows.length && <tr><td colSpan={columns.length}>No customers match the selected filters.</td></tr>}</tbody></table></div></div>}
  </section>
}

function unique(values) { return [...new Set(values.filter(Boolean))].sort() }
function compare(a, b) { return typeof a === 'number' || typeof b === 'number' ? Number(a || 0) - Number(b || 0) : String(a || '').localeCompare(String(b || '')) }
function money(value) { return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) }
function formatCell(key, value) { return key === 'achievement' ? value == null ? 'Not set' : `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%` : moneyKeys.has(key) ? money(value) : value || '—' }
function achievementClass(value) { return value >= 100 ? 'positive-text' : value == null ? '' : 'negative-text' }
async function api(url, options = {}) { const response = await fetch(url, options.body ? { ...options, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) } : options); const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Request failed.'); return data }
