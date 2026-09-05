import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Save, Target as TargetSymbol, Trash2, UsersRound } from 'lucide-react'

const months = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March']

export function CustomTarget() {
  const today = isoToday(), [year, setYear] = useState(financialYear(today)), [customers, setCustomers] = useState([])
  const [targets, setTargets] = useState([]), [customer, setCustomer] = useState(''), [values, setValues] = useState(Array(12).fill(''))
  const [notice, setNotice] = useState({ type: '', text: '' })
  const load = useCallback(async () => {
    try {
      const [ledgers, rows] = await Promise.all([api('/api/reporting/ledgers'), api(`/api/reporting/targets?financialYear=${encodeURIComponent(year)}`)])
      setCustomers([...new Map(ledgers.map((row) => [row.partyKey, row.partyName])).values()].sort())
      const grouped = new Map()
      rows.forEach((row) => { if (!grouped.has(row.customerKey)) grouped.set(row.customerKey, { customerKey: row.customerKey, customerName: row.customerName, months: Array(12).fill(0) }); grouped.get(row.customerKey).months[row.fiscalMonth - 1] = Number(row.amount) })
      setTargets([...grouped.values()])
    } catch (error) { setNotice({ type: 'danger', text: error.message }) }
  }, [year])
  useEffect(() => { load() }, [load])
  function selectCustomer(name) { setCustomer(name); const saved = targets.find((row) => normalize(row.customerName) === normalize(name)); setValues(saved ? saved.months.map(String) : Array(12).fill('')) }
  function spreadAnnual() { const input = window.prompt('Enter the annual target amount'); if (input === null) return; const amount = Number(input); if (!Number.isFinite(amount) || amount < 0) return setNotice({ type: 'danger', text: 'Enter a valid non-negative annual target.' }); setValues(Array(12).fill(String(amount / 12))) }
  async function save() { try { await api('/api/reporting/targets', { method: 'PUT', body: { customerName: customer, financialYear: year, months: values.map((value) => Number(value || 0)) } }); setNotice({ type: 'success', text: 'Monthly targets saved.' }); await load() } catch (error) { setNotice({ type: 'danger', text: error.message }) } }
  async function remove(row) { try { await api(`/api/reporting/targets/${encodeURIComponent(row.customerKey)}/${year}`, { method: 'DELETE' }); setNotice({ type: 'success', text: 'Target removed.' }); await load() } catch (error) { setNotice({ type: 'danger', text: error.message }) } }
  return <section className="stack"><Heading icon={TargetIcon} title="Custom Target" text="Maintain April–March customer targets; the annual total is calculated automatically." /><Notice notice={notice} />
    <div className="panel target-editor"><label>Financial Year<select value={year} onChange={(event) => setYear(event.target.value)}>{yearOptions(today).map((value) => <option key={value}>{value}</option>)}</select></label><label>Customer<select value={customer} onChange={(event) => selectCustomer(event.target.value)}><option value="">Select a customer</option>{customers.map((name) => <option key={name}>{name}</option>)}</select></label><div className="button-row"><button className="secondary-button" onClick={spreadAnnual} type="button">Spread Annual</button><button className="primary-button" disabled={!customer} onClick={save} type="button"><Save size={16} /> Save</button></div>
      <div className="month-inputs">{months.map((month, index) => <label key={month}>{month}<input min="0" step="0.01" type="number" value={values[index]} onChange={(event) => setValues((current) => current.map((value, i) => i === index ? event.target.value : value))} /></label>)}</div></div>
    <div className="panel table-panel"><div className="table-heading"><h2>Saved FY Targets</h2></div><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Annual Target</th><th>Action</th></tr></thead><tbody>{targets.map((row) => <tr key={row.customerKey}><td>{row.customerName}</td><Amount value={row.months.reduce((sum, value) => sum + value, 0)} /><td><button className="danger-button" onClick={() => remove(row)} type="button"><Trash2 size={14} /> Delete</button></td></tr>)}{!targets.length && <tr><td colSpan="3">No targets saved for this financial year.</td></tr>}</tbody></table></div></div>
  </section>
}

function TargetIcon(props) { return <TargetSymbol {...props} /> }

export function SalesManTargets({ firms }) {
  const today = isoToday(), [firm, setFirm] = useState(firstFirm(firms)), [year, setYear] = useState(financialYear(today))
  const [person, setPerson] = useState(''), [values, setValues] = useState(Array(12).fill('')), [report, setReport] = useState(null)
  const [notice, setNotice] = useState({ type: '', text: '' })
  const load = useCallback(async () => {
    if (!firm) return setReport(null)
    try { setReport(await getPerformance({ firm, financialYear: year, asOfDate: today })) } catch (error) { setNotice({ type: 'danger', text: error.message }) }
  }, [firm, year, today])
  useEffect(() => { load() }, [load])
  const selected = report?.salesPeople.find((row) => row.salesPerson === person)
  useEffect(() => { setValues(selected ? selected.months.map((row) => String(row.target || '')) : Array(12).fill('')) }, [selected])
  async function save() {
    try {
      await api('/api/reporting/sales-person-targets', { method: 'PUT', body: { firm, salesPerson: person, financialYear: year, months: values.map((value) => Number(value || 0)) } })
      setNotice({ type: 'success', text: 'Sales man targets saved.' }); await load()
    } catch (error) { setNotice({ type: 'danger', text: error.message }) }
  }
  async function remove(salesPerson) {
    try {
      await api(`/api/reporting/sales-person-targets?${new URLSearchParams({ firm, salesPerson, financialYear: year })}`, { method: 'DELETE' })
      if (person === salesPerson) setPerson('')
      setNotice({ type: 'success', text: 'Sales man targets removed.' }); await load()
    } catch (error) { setNotice({ type: 'danger', text: error.message }) }
  }
  return <section className="stack target-report-page">
    <Heading icon={UsersRound} title="Target by Sales Man" text="Set April–March targets and review net-sales achievement for each sales man and firm." />
    <Filters firms={firms} firm={firm} setFirm={(value) => { setFirm(value); setPerson('') }} year={year} setYear={(value) => { setYear(value); setPerson('') }} today={today}>
      <PersonSelect people={report?.salesPeople.map((row) => row.salesPerson) || []} value={person} onChange={setPerson} />
    </Filters>
    <Notice notice={notice} />
    {report?.unattributedRows > 0 && <div className="banner info">{report.unattributedRows} voucher row(s), net {money(report.unattributedAmount)}, could not be attributed to a sales man.</div>}
    {person && <div className="panel target-entry-panel"><div className="target-entry-heading"><div><h2>Monthly Targets</h2><p>{person} · {firm} · FY {year}</p></div><strong>Annual target: {money(values.reduce((sum, value) => sum + Number(value || 0), 0))}</strong></div>
      <div className="month-inputs">{months.map((month, index) => <label key={month}>{month}<input min="0" step="0.01" type="number" value={values[index]} onChange={(event) => setValues((current) => current.map((value, i) => i === index ? event.target.value : value))} /></label>)}</div>
      <div className="button-row target-save-row"><button className="primary-button" onClick={save} type="button"><Save size={16} /> Save targets</button></div></div>}
    <div className="panel table-panel"><div className="table-heading"><h2>Sales Man Performance</h2></div><div className="table-wrap"><table className="target-summary-table"><thead><tr><th>Sales Man</th><th>Annual Target</th><th>Net Sales</th><th>Shortfall / Excess</th><th>Achievement</th><th>Action</th></tr></thead><tbody>
      {report?.salesPeople.map((row) => <tr key={row.salesPerson}><td>{row.salesPerson}</td><Amount value={row.target} /><Amount value={row.actual} /><Variance value={row.variance} /><td className="num">{percent(row.achievement)}</td><td><button className="danger-button" disabled={!row.months.some((month) => month.target)} onClick={() => remove(row.salesPerson)} type="button"><Trash2 size={14} /> Delete</button></td></tr>)}
      {!report?.salesPeople.length && <tr><td colSpan="6">No sales people are available. Synchronize company assignments first.</td></tr>}
    </tbody></table></div></div>
  </section>
}

export function WeeklyMonthlyTargets({ firms }) {
  const today = isoToday(), [firm, setFirm] = useState(firstFirm(firms)), [year, setYear] = useState(financialYear(today))
  const [person, setPerson] = useState(''), [month, setMonth] = useState(fiscalMonth(today)), [people, setPeople] = useState([])
  const [report, setReport] = useState(null), [values, setValues] = useState([]), [notice, setNotice] = useState({ type: '', text: '' })
  useEffect(() => {
    if (!firm) return
    getPerformance({ firm, financialYear: year, asOfDate: today }).then((data) => setPeople(data.salesPeople.map((row) => row.salesPerson))).catch((error) => setNotice({ type: 'danger', text: error.message }))
  }, [firm, year, today])
  const load = useCallback(async () => {
    if (!firm || !person) { setReport(null); return }
    try { const data = await getPerformance({ firm, financialYear: year, salesPerson: person, fiscalMonth: month, asOfDate: today }); setReport(data); setValues(data.period.weeks.map((row) => String(row.target || ''))) }
    catch (error) { setNotice({ type: 'danger', text: error.message }) }
  }, [firm, year, person, month, today])
  useEffect(() => { load() }, [load])
  async function save() {
    try {
      const weeks = report.period.weeks.map((week, index) => ({ startDate: week.startDate, endDate: week.endDate, amount: Number(values[index] || 0) }))
      await api('/api/reporting/weekly-sales-targets', { method: 'PUT', body: { firm, salesPerson: person, financialYear: year, fiscalMonth: month, weeks } })
      setNotice({ type: 'success', text: 'Weekly targets saved.' }); await load()
    } catch (error) { setNotice({ type: 'danger', text: error.message }) }
  }
  const period = report?.period
  return <section className="stack target-report-page"><Heading icon={CalendarDays} title="Sales Weekly Monthly Target" text="Compare monthly and Monday–Sunday weekly targets with actual net sales." />
    <Filters className="four-columns" firms={firms} firm={firm} setFirm={(value) => { setFirm(value); setPerson('') }} year={year} setYear={(value) => { setYear(value); setPerson('') }} today={today}>
      <label>Month<select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label><PersonSelect people={people} value={person} onChange={setPerson} />
    </Filters><Notice notice={notice} />{!person && <div className="banner info">Select a sales man to view monthly and weekly achievement.</div>}
    {period && <><div className="target-kpis"><Kpi label="Monthly Target" value={money(period.target)} /><Kpi label="Net Sales" value={money(period.actual)} /><Kpi label="Shortfall / Excess" value={signedMoney(period.variance)} tone={period.variance >= 0 ? 'positive' : 'negative'} /><Kpi label="Achievement" value={percent(period.achievement)} /><Kpi label="Status" value={period.status} /></div>
      <div className="panel table-panel"><div className="table-heading"><div><h2>{period.name} Weekly Targets</h2><p>{period.startDate} to {period.endDate}</p></div><button className="primary-button" onClick={save} type="button"><Save size={16} /> Save weekly targets</button></div><div className="table-wrap"><table className="weekly-target-table"><thead><tr><th>Week</th><th>Period</th><th>Weekly Target</th><th>Net Sales</th><th>Shortfall / Excess</th><th>Achievement</th><th>Status</th></tr></thead><tbody>
        {period.weeks.map((week, index) => { const target = Number(values[index] || 0), variance = week.actual - target; return <tr key={week.startDate}><td>Week {week.index}</td><td>{shortDate(week.startDate)} – {shortDate(week.endDate)}</td><td><input aria-label={`Week ${week.index} target`} min="0" step="0.01" type="number" value={values[index] ?? ''} onChange={(event) => setValues((current) => current.map((value, i) => i === index ? event.target.value : value))} /></td><Amount value={week.actual} /><Variance value={variance} /><td className="num">{percent(target ? week.actual / target * 100 : null)}</td><td><span className={`period-status ${week.status.toLowerCase().replace(' ', '-')}`}>{week.status}</span></td></tr> })}
      </tbody></table></div></div></>}
  </section>
}

function Heading({ icon: Icon, title, text }) { return <div className="panel report-heading"><div className="target-page-title"><span><Icon size={19} /></span><div><h2>{title}</h2><p>{text}</p></div></div></div> }
function Filters({ className = '', firms, firm, setFirm, year, setYear, today, children }) { return <div className={`panel target-filter-grid ${className}`}><label>Tally Firm<select value={firm} onChange={(event) => setFirm(event.target.value)}><option value="">Select a firm</option>{firms.filter((row) => row.name).map((row) => <option key={row.id}>{row.name}</option>)}</select></label><label>Financial Year<select value={year} onChange={(event) => setYear(event.target.value)}>{yearOptions(today).map((value) => <option key={value}>{value}</option>)}</select></label>{children}</div> }
function PersonSelect({ people, value, onChange }) { return <label>Sales Man<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select a sales man</option>{people.map((person) => <option key={person}>{person}</option>)}</select></label> }
function Notice({ notice }) { return notice.text ? <div className={`banner ${notice.type}`}>{notice.text}</div> : null }
function Kpi({ label, value, tone = '' }) { return <div className={`report-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div> }
function Amount({ value }) { return <td className="num">{money(value)}</td> }
function Variance({ value }) { return <td className={`num ${value >= 0 ? 'positive-text' : 'negative-text'}`}>{signedMoney(value)}</td> }
function isoToday() { return new Date().toISOString().slice(0, 10) }
function firstFirm(firms) { return firms.find((row) => row.name)?.name || '' }
function money(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0)) }
function signedMoney(value) { return `${Number(value || 0) >= 0 ? '+' : ''}${money(value)}` }
function percent(value) { return value === null || value === undefined ? 'Not set' : `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%` }
function shortDate(value) { return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) }
function financialYear(value) { const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), start = month >= 4 ? year : year - 1; return `${start}-${String(start + 1).slice(-2)}` }
function fiscalMonth(value) { const month = Number(value.slice(5, 7)); return month >= 4 ? month - 3 : month + 9 }
function yearOptions(value) { const current = Number(financialYear(value).slice(0, 4)); return Array.from({ length: 8 }, (_, index) => { const start = current + 2 - index; return `${start}-${String(start + 1).slice(-2)}` }) }
function normalize(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN') }
function getPerformance(params) { return api(`/api/reporting/target-performance?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])))}`) }
async function api(url, options = {}) { const response = await fetch(url, options.body ? { ...options, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) } : options); const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Request failed.'); return data }
