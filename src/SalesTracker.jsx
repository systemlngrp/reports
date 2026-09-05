import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Plus, Printer, Save, Trash2 } from 'lucide-react'

const months = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March']

export function SalesTracker({ firms }) {
  const today = new Date().toISOString().slice(0, 10)
  const yearOptions = financialYearOptions(today)
  const [financialYear, setFinancialYear] = useState(financialYearForDate(today))
  const [reportView, setReportView] = useState('fy')
  const [asOfDate, setAsOfDate] = useState(today)
  const [selectedFirms, setSelectedFirms] = useState([])
  const [report, setReport] = useState(null)
  const [status, setStatus] = useState({ loading: true, error: '' })

  const firmFilter = selectedFirms.join('|')
  const loadReport = useCallback(async () => {
    setStatus({ loading: true, error: '' })
    try {
      const params = new URLSearchParams({ financialYear, asOfDate })
      if (firmFilter) params.set('firms', firmFilter.split('|').join(','))
      setReport(await apiGet(`/api/reporting/sales-tracker?${params}`))
      setStatus({ loading: false, error: '' })
    } catch (error) {
      setStatus({ loading: false, error: error.message })
    }
  }, [financialYear, asOfDate, firmFilter])

  useEffect(() => { loadReport() }, [loadReport])

  function toggleFirm(name) {
    setSelectedFirms((current) => current.includes(name) ? current.filter((value) => value !== name) : [...current, name])
  }

  async function exportXlsx() {
    if (!report) return
    const { Workbook } = await import('exceljs')
    const workbook = new Workbook()
    const summary = [
      ['Sales Tracker', `FY ${financialYear}`], ['As of', asOfDate], ['Firms', selectedFirms.join(', ') || 'All Firms'], [],
      ['Metric', 'Amount'], ['Gross sales', report.kpis.grossSales], ['Credit notes', report.kpis.creditNotes],
      ['Intercompany exclusions', report.kpis.intercompanyExclusions], ['Net sales', report.kpis.netSales],
      ['Period target', report.kpis.periodTarget], ['Achievement %', report.kpis.achievementPercent ?? 'Not set'],
      ['Shortfall / excess', report.kpis.shortfallExcess],
    ]
    appendSheet(workbook, 'Summary', summary)
    appendSheet(workbook, 'Monthly Trend', [['Month', 'Net Sales', 'Target'], ...report.monthly.map((row) => [row.name, row.netSales, row.target])])
    appendSheet(workbook, 'Customer Performance', [
      ['Customer', 'Gross Sales', 'Credit Notes', 'Net Sales', 'Period Target', 'Contribution %', 'Achievement %', 'Shortfall / Excess'],
      ...report.customers.map((row) => [row.customerName, row.grossSales, row.creditNotes, row.netSales, row.target, row.contributionPercent, row.achievementPercent ?? 'Not set', row.shortfallExcess]),
    ])
    appendSheet(workbook, 'Customer by Month', [
      ['Customer', ...months, 'Total'],
      ...report.customers.map((row) => [row.customerName, ...row.months.map((month) => month.netSales), row.netSales]),
    ])
    appendSheet(workbook, 'Reconciliation', [
      ['Customer', 'Gross Sales', 'Credit Notes', 'Net Sales'],
      ...report.customers.map((row) => [row.customerName, row.grossSales, row.creditNotes, row.netSales]),
      [], ['Intercompany exclusions', report.kpis.intercompanyExclusions],
    ])
    await downloadWorkbook(workbook, `sales-tracker-${financialYear}-${asOfDate}.xlsx`)
  }

  return (
    <section className="stack tracker-page">
      <div className="panel split-panel report-heading">
        <div><h2>Sales Management Tracker</h2><p>Net sales, customer targets, and performance for the selected financial year.</p></div>
        <div className="button-row no-print">
          <button className="secondary-button" onClick={() => window.print()} type="button"><Printer size={17} /> Print / PDF</button>
          <button className="primary-button" disabled={!report} onClick={exportXlsx} type="button"><Download size={17} /> Export Excel</button>
        </div>
      </div>
      <div className="panel report-filters no-print">
        <label>Report View<select value={reportView} onChange={(event) => setReportView(event.target.value)}><option value="fy">FY Wise</option><option value="month">Month Wise</option></select></label>
        <label>Financial Year<select value={financialYear} onChange={(event) => setFinancialYear(event.target.value)}>{yearOptions.map((year) => <option key={year}>{year}</option>)}</select></label>
        <label>As of Date<input value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} type="date" /></label>
        <fieldset><legend>Tally Firms</legend><div className="firm-checks">
          {firms.filter((firm) => firm.name).map((firm) => <label key={firm.id}><input checked={selectedFirms.includes(firm.name)} onChange={() => toggleFirm(firm.name)} type="checkbox" />{firm.name}</label>)}
          {!firms.some((firm) => firm.name) && <span>No configured firms</span>}
        </div></fieldset>
      </div>
      {status.error && <Message tone="danger">{status.error}</Message>}
      {status.loading && <div className="state-panel"><h2>Preparing the sales tracker</h2><p>Calculating sales, credit notes, exclusions, and targets.</p></div>}
      {!status.loading && report && <ReportBody report={report} view={reportView} />}
    </section>
  )
}

function ReportBody({ report, view }) {
  const maximum = Math.max(1, ...report.monthly.flatMap((row) => [row.netSales, row.target]))
  const kpis = report.kpis
  if (view === 'month') {
    return report.customers.length ? <MonthlyMatrix customers={report.customers} /> : <Message tone="info">No customer sales match these filters.</Message>
  }
  return <>
    <div className="tracker-kpis">
      <ReportMetric label="Gross Sales" value={currency(kpis.grossSales)} />
      <ReportMetric label="Credit Notes" value={currency(kpis.creditNotes)} tone="negative" />
      <ReportMetric label="Intercompany Excluded" value={currency(kpis.intercompanyExclusions)} />
      <ReportMetric label="Net Sales" value={currency(kpis.netSales)} tone="primary" />
      <ReportMetric label="Period Target" value={currency(kpis.periodTarget)} />
      <ReportMetric label="Achievement" value={percent(kpis.achievementPercent)} tone={kpis.achievementPercent >= 100 ? 'positive' : 'negative'} />
      <ReportMetric label="Shortfall / Excess" value={signedCurrency(kpis.shortfallExcess)} tone={kpis.shortfallExcess >= 0 ? 'positive' : 'negative'} />
    </div>
    <div className="panel chart-panel"><div className="table-heading"><h2>Month-on-Month Trend</h2></div>
      <div className="bar-chart" role="img" aria-label="Monthly net sales and targets">
        {report.monthly.map((row) => <div className="bar-group" key={row.index} title={`${row.name}: ${currency(row.netSales)} net / ${currency(row.target)} target`}>
          <div className="bars"><i className="bar sales-bar" style={{ height: `${Math.max(0, row.netSales / maximum) * 100}%` }} /><i className="bar target-bar" style={{ height: `${Math.max(0, row.target / maximum) * 100}%` }} /></div>
          <span>{row.name.slice(0, 3)}</span>
        </div>)}
      </div><div className="chart-legend"><span><i className="legend-sales" />Net sales</span><span><i className="legend-target" />Target</span></div>
    </div>
    {!report.customers.length ? <Message tone="info">No sales, credit notes, or targets match these filters.</Message> : <>
      <PerformanceTable customers={report.customers} />
    </>}
  </>
}

function PerformanceTable({ customers }) {
  return <div className="panel table-panel"><div className="table-heading"><h2>Customer Performance</h2></div><div className="table-wrap"><table className="tracker-table"><thead><tr>
    <th>Customer</th><th>Gross Sales</th><th>Credit Notes</th><th>Net Sales</th><th>Period Target</th><th>Contribution</th><th>Achievement</th><th>Shortfall / Excess</th>
  </tr></thead><tbody>{customers.map((row) => <tr key={row.customerKey}><td className="customer-name">{row.customerName}</td><Money value={row.grossSales} /><Money value={row.creditNotes} /><Money value={row.netSales} /><Money value={row.target} />
    <td className="num">{percent(row.contributionPercent)}</td><td className={`num status-number ${row.achievementPercent >= 100 ? 'positive' : 'negative'}`}>{percent(row.achievementPercent)}</td><td className={`num status-number ${row.shortfallExcess >= 0 ? 'positive' : 'negative'}`}>{signedCurrency(row.shortfallExcess)}</td></tr>)}</tbody></table></div></div>
}

function MonthlyMatrix({ customers }) {
  const totals = months.map((_, index) => customers.reduce((sum, row) => sum + Number(row.months[index].netSales || 0), 0))
  return <div className="panel table-panel"><div className="table-heading"><h2>Customer by Month</h2></div><div className="table-wrap"><table className="matrix-table"><thead><tr><th>Customer</th>{months.map((month) => <th key={month}>{month}</th>)}<th>Total</th></tr></thead><tbody>
    {customers.map((row) => <tr key={row.customerKey}><td className="customer-name">{row.customerName}</td>{row.months.map((month) => <Money key={month.index} value={month.netSales} />)}<Money value={row.netSales} /></tr>)}
    <tr className="total-row"><td>Total Net Sales</td>{totals.map((value, index) => <Money key={months[index]} value={value} />)}<Money value={totals.reduce((sum, value) => sum + value, 0)} /></tr>
  </tbody></table></div></div>
}

export function SalesByMonthReport({ firms }) {
  const today = new Date().toISOString().slice(0, 10)
  const yearOptions = financialYearOptions(today)
  const [financialYear, setFinancialYear] = useState(financialYearForDate(today))
  const [asOfDate, setAsOfDate] = useState(today)
  const [selectedFirms, setSelectedFirms] = useState([])
  const [report, setReport] = useState(null)
  const [status, setStatus] = useState({ loading: true, error: '' })
  const firmFilter = selectedFirms.join('|')

  const loadReport = useCallback(async () => {
    setStatus({ loading: true, error: '' })
    try {
      const params = new URLSearchParams({ financialYear, asOfDate })
      if (firmFilter) params.set('firms', firmFilter.split('|').join(','))
      setReport(await apiGet(`/api/reporting/sales-tracker?${params}`))
      setStatus({ loading: false, error: '' })
    } catch (error) { setStatus({ loading: false, error: error.message }) }
  }, [financialYear, asOfDate, firmFilter])

  useEffect(() => { loadReport() }, [loadReport])

  function toggleFirm(name) {
    setSelectedFirms((current) => current.includes(name) ? current.filter((value) => value !== name) : [...current, name])
  }

  async function exportMonthly() {
    if (!report) return
    const { Workbook } = await import('exceljs')
    const workbook = new Workbook()
    const totals = months.map((_, index) => report.customers.reduce((sum, row) => sum + Number(row.months[index].netSales || 0), 0))
    appendSheet(workbook, 'Customer by Month', [
      ['Sales By Month', `FY ${financialYear}`, `As of ${asOfDate}`],
      ['Customer', ...months, 'Total'],
      ...report.customers.map((row) => [row.customerName, ...row.months.map((month) => month.netSales), row.netSales]),
      ['Total Net Sales', ...totals, totals.reduce((sum, value) => sum + value, 0)],
    ])
    await downloadWorkbook(workbook, `sales-by-month-${financialYear}-${asOfDate}.xlsx`)
  }

  return <section className="stack tracker-page">
    <div className="panel split-panel report-heading"><div><h2>Sales by Month</h2><p>Customer-wise net sales across the April–March financial year.</p></div><div className="button-row no-print"><button className="secondary-button" onClick={() => window.print()} type="button"><Printer size={17} /> Print / PDF</button><button className="primary-button" disabled={!report} onClick={exportMonthly} type="button"><Download size={17} /> Export Excel</button></div></div>
    <div className="panel report-filters no-print"><label>Financial Year<select value={financialYear} onChange={(event) => setFinancialYear(event.target.value)}>{yearOptions.map((year) => <option key={year}>{year}</option>)}</select></label><label>As of Date<input value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} type="date" /></label><fieldset><legend>Tally Firms</legend><div className="firm-checks">{firms.filter((firm) => firm.name).map((firm) => <label key={firm.id}><input checked={selectedFirms.includes(firm.name)} onChange={() => toggleFirm(firm.name)} type="checkbox" />{firm.name}</label>)}</div></fieldset></div>
    {status.error && <Message tone="danger">{status.error}</Message>}
    {status.loading && <div className="state-panel"><h2>Preparing monthly report</h2><p>Aggregating customer sales for each financial-year month.</p></div>}
    {!status.loading && report && (report.customers.length ? <MonthlyMatrix customers={report.customers} /> : <Message tone="info">No customer sales match these filters.</Message>)}
  </section>
}

export function TargetManagement() {
  const today = new Date().toISOString().slice(0, 10)
  const yearOptions = financialYearOptions(today)
  const [financialYear, setFinancialYear] = useState(financialYearForDate(today))
  const [ledgers, setLedgers] = useState([])
  const [targets, setTargets] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [values, setValues] = useState(Array(12).fill(''))
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const [ledgerRows, targetRows] = await Promise.all([apiGet('/api/reporting/ledgers'), apiGet(`/api/reporting/targets?financialYear=${encodeURIComponent(financialYear)}`)])
      setLedgers(uniqueCustomers(ledgerRows)); setTargets(groupTargets(targetRows))
    } catch (error) { setMessage(error.message) }
  }, [financialYear])
  useEffect(() => { load() }, [load])
  function selectCustomer(name) {
    setCustomerName(name)
    const saved = targets.find((row) => row.customerKey === normalize(name))
    setValues(saved ? saved.months.map(String) : Array(12).fill(''))
  }
  function equalSplit() {
    const annual = window.prompt('Enter the annual target amount')
    if (annual === null) return
    const amount = Number(annual)
    if (!Number.isFinite(amount) || amount < 0) return setMessage('Enter a valid non-negative annual target.')
    setValues(Array(12).fill((amount / 12).toFixed(2)))
  }
  async function save() {
    try {
      await apiPut('/api/reporting/targets', { customerName, financialYear, months: values.map((value) => value === '' ? 0 : Number(value)) })
      setMessage('Monthly targets saved.'); await load()
    } catch (error) { setMessage(error.message) }
  }
  async function remove(row) {
    await apiDelete(`/api/reporting/targets/${encodeURIComponent(row.customerKey)}/${financialYear}`); setMessage('Target removed.'); await load()
  }
  const annual = values.reduce((sum, value) => sum + (Number(value) || 0), 0)
  return <section className="stack"><div className="panel split-panel"><div><h2>Customer Targets</h2><p>Maintain April–March monthly targets; the annual total is calculated automatically.</p></div></div>
    {message && <Message tone={message.includes('saved') || message.includes('removed') ? 'success' : 'danger'}>{message}</Message>}
    <div className="panel target-editor"><label>Financial Year<select value={financialYear} onChange={(event) => setFinancialYear(event.target.value)}>{yearOptions.map((year) => <option key={year}>{year}</option>)}</select></label><label>Customer<select value={customerName} onChange={(event) => selectCustomer(event.target.value)}><option value="">Select a customer</option>{ledgers.map((name) => <option key={name}>{name}</option>)}</select></label>
      <div className="button-row"><button className="secondary-button" onClick={equalSplit} type="button">Equal Split</button><strong>Annual: {currency(annual)}</strong></div>
      <div className="month-inputs">{months.map((month, index) => <label key={month}>{month}<input min="0" step="0.01" type="number" value={values[index]} onChange={(event) => setValues((current) => current.map((value, valueIndex) => valueIndex === index ? event.target.value : value))} /></label>)}</div>
      <button className="primary-button" disabled={!customerName} onClick={save} type="button"><Save size={17} /> Save Targets</button>
    </div>
    <div className="panel table-panel"><div className="table-heading"><h2>Saved FY Targets</h2></div><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Annual Target</th><th>Action</th></tr></thead><tbody>{targets.map((row) => <tr key={row.customerKey}><td>{row.customerName}</td><td className="num">{currency(row.months.reduce((sum, value) => sum + value, 0))}</td><td><button className="danger-button" onClick={() => remove(row)} type="button"><Trash2 size={16} /> Delete</button></td></tr>)}{!targets.length && <tr><td colSpan="3">No targets saved for this financial year.</td></tr>}</tbody></table></div></div>
  </section>
}

export function IntercompanySettings({ firms }) {
  const [ledgers, setLedgers] = useState([]); const [exclusions, setExclusions] = useState([])
  const [firm, setFirm] = useState(''); const [partyName, setPartyName] = useState(''); const [message, setMessage] = useState('')
  useEffect(() => { load() }, [])
  async function load() { try { const [ledgerRows, excludedRows] = await Promise.all([apiGet('/api/reporting/ledgers'), apiGet('/api/reporting/exclusions')]); setLedgers(ledgerRows); setExclusions(excludedRows) } catch (error) { setMessage(error.message) } }
  const parties = useMemo(() => ledgers.filter((row) => row.firm === firm), [firm, ledgers])
  async function add() { try { await apiPost('/api/reporting/exclusions', { firm, partyName }); setPartyName(''); setMessage('Intercompany party added.'); await load() } catch (error) { setMessage(error.message) } }
  async function remove(id) { try { await apiDelete(`/api/reporting/exclusions/${id}`); setMessage('Intercompany party removed.'); await load() } catch (error) { setMessage(error.message) } }
  return <section className="stack"><div className="panel split-panel"><div><h2>Intercompany Parties</h2><p>Sales to these debtor ledgers are excluded from management net sales.</p></div></div>{message && <Message tone={message.includes('added') || message.includes('removed') ? 'success' : 'danger'}>{message}</Message>}
    <div className="panel exclusion-form"><label>Tally Firm<select value={firm} onChange={(event) => { setFirm(event.target.value); setPartyName('') }}><option value="">Select a firm</option>{firms.filter((row) => row.name).map((row) => <option key={row.id}>{row.name}</option>)}</select></label><label>Debtor Ledger<select disabled={!firm} value={partyName} onChange={(event) => setPartyName(event.target.value)}><option value="">Select a party</option>{parties.map((row) => <option key={`${row.firm}-${row.partyKey}`}>{row.partyName}</option>)}</select></label><button className="primary-button" disabled={!firm || !partyName} onClick={add} type="button"><Plus size={17} /> Add Exclusion</button></div>
    <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Tally Firm</th><th>Excluded Party</th><th>Action</th></tr></thead><tbody>{exclusions.map((row) => <tr key={row.id}><td>{row.firm}</td><td>{row.partyName}</td><td><button className="danger-button" onClick={() => remove(row.id)} type="button"><Trash2 size={16} /> Delete</button></td></tr>)}{!exclusions.length && <tr><td colSpan="3">No intercompany parties configured.</td></tr>}</tbody></table></div></div>
  </section>
}

function ReportMetric({ label, value, tone = '' }) { return <div className={`report-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div> }
function Money({ value }) { return <td className={`num ${value < 0 ? 'negative' : ''}`}>{currency(value)}</td> }
function Message({ children, tone }) { return <div className={`banner ${tone}`}>{children}</div> }
function percent(value) { return value === null || value === undefined ? 'Not set' : `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%` }
function currency(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0)) }
function signedCurrency(value) { return `${value >= 0 ? '+' : ''}${currency(value)}` }
function financialYearForDate(value) { const [year, month] = value.split('-').map(Number); const start = month >= 4 ? year : year - 1; return `${start}-${String(start + 1).slice(-2)}` }
function financialYearOptions(value) { const current = Number(financialYearForDate(value).slice(0, 4)); return Array.from({ length: 8 }, (_, index) => { const start = current + 2 - index; return `${start}-${String(start + 1).slice(-2)}` }) }
function normalize(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN') }
function uniqueCustomers(rows) { return [...new Map(rows.map((row) => [row.partyKey, row.partyName])).values()].sort((a, b) => a.localeCompare(b)) }
function groupTargets(rows) { const grouped = new Map(); rows.forEach((row) => { if (!grouped.has(row.customerKey)) grouped.set(row.customerKey, { customerKey: row.customerKey, customerName: row.customerName, months: Array(12).fill(0) }); grouped.get(row.customerKey).months[Number(row.fiscalMonth) - 1] = Number(row.amount) }); return [...grouped.values()] }
function appendSheet(workbook, name, rows) {
  const sheet = workbook.addWorksheet(name)
  sheet.addRows(rows)
  sheet.columns = rows[0].map((_, index) => ({ width: index === 0 ? 32 : 18 }))
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } } })
}
async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
async function apiGet(url) { const response = await fetch(url); return parse(response) }
async function apiPost(url, body) { const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return parse(response) }
async function apiPut(url, body) { const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return parse(response) }
async function apiDelete(url) { const response = await fetch(url, { method: 'DELETE' }); return parse(response) }
async function parse(response) { const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Request failed.'); return data }
