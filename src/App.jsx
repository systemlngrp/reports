import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  PlugZap,
  Receipt,
  RefreshCw,
  Save,
  Search,
  ShoppingCart,
  XCircle,
} from 'lucide-react'
import './App.css'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: ClipboardList },
  { id: 'sales', label: 'Sales', icon: ShoppingCart },
  { id: 'receipts', label: 'Receipts', icon: Receipt },
  { id: 'credit-notes', label: 'Credit Notes', icon: CreditCard },
  { id: 'firms', label: 'Firms', icon: Building2 },
  { id: 'history', label: 'Tally Sales Data History', icon: History },
]

const pageThemes = {
  dashboard: 'theme-blue',
  sales: 'theme-red',
  receipts: 'theme-cyan',
  'credit-notes': 'theme-blue-red',
  firms: 'theme-cyan-red',
  history: 'theme-blue-cyan',
}

const pagePaths = {
  dashboard: '/dashbaord',
  sales: '/Sales',
  receipts: '/receipt',
  'credit-notes': '/creditnote',
  firms: '/firms',
  history: '/history',
}

const routeAliases = {
  '/': 'dashboard',
  '/dasboard': 'dashboard',
  '/dashbaord': 'dashboard',
  '/dashboard': 'dashboard',
  '/sales': 'sales',
  '/Sales': 'sales',
  '/receipt': 'receipts',
  '/receipts': 'receipts',
  '/creditnote': 'credit-notes',
  '/creditnotes': 'credit-notes',
  '/credit-notes': 'credit-notes',
  '/firms': 'firms',
  '/history': 'history',
}

const emptyFilters = {
  firm: 'all',
  fromDate: '',
  toDate: '',
  debtor: '',
  invoiceNo: '',
  item: '',
}

const salesPageSize = 50

function App() {
  const [active, setActive] = useState(getPageFromPath)
  const [firms, setFirms] = useState([])
  const [salesHistory, setSalesHistory] = useState([])
  const [filters, setFilters] = useState(emptyFilters)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [health, setHealth] = useState(null)
  const [menuOpen, setMenuOpen] = useState(true)

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    function handleRouteChange() {
      setActive(getPageFromPath())
    }

    window.addEventListener('popstate', handleRouteChange)
    return () => window.removeEventListener('popstate', handleRouteChange)
  }, [])

  function navigate(page) {
    setActive(page)
    const nextPath = pagePaths[page]
    if (nextPath && window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }
  }

  async function loadInitialData() {
    setLoading(true)
    setError('')
    try {
      const [healthData, firmsData, historyData] = await Promise.all([
        apiGet('/api/health'),
        apiGet('/api/firms'),
        apiGet('/api/sales-history'),
      ])
      setHealth(healthData)
      setFirms(firmsData)
      setSalesHistory(historyData)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredHistory = useMemo(() => {
    return salesHistory.filter((row) => {
      const matchFirm = filters.firm === 'all' || row.firm === filters.firm
      const matchFrom = !filters.fromDate || row.date >= filters.fromDate
      const matchTo = !filters.toDate || row.date <= filters.toDate
      const matchDebtor = includesText(row.debtor, filters.debtor)
      const matchInvoice = includesText(row.invoiceNo, filters.invoiceNo)
      const matchItem = includesText(row.item, filters.item)
      return matchFirm && matchFrom && matchTo && matchDebtor && matchInvoice && matchItem
    })
  }, [filters, salesHistory])

  const totals = useMemo(() => {
    const amount = filteredHistory.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const qty = filteredHistory.reduce((sum, row) => sum + Number(row.qty || 0), 0)
    return { amount, qty }
  }, [filteredHistory])

  return (
    <div className={`app-shell ${pageThemes[active]} ${menuOpen ? '' : 'menu-collapsed'}`}>
      <aside className="sidebar">
        <div className="brand">
          <FileText size={28} />
          <div>
            <strong>Report</strong>
            <span>Tally Data Center</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={active === item.id ? 'nav-item active' : 'nav-item'}
                key={item.id}
                onClick={() => navigate(item.id)}
                type="button"
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="server-status">
          <span className={health?.ok ? 'dot online' : 'dot'} />
          <div>
            <strong>{health?.ok ? 'API online' : 'API status'}</strong>
            <small>{health?.storeMode || 'checking'}</small>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Local Tally reporting</p>
            <h1>{navItems.find((item) => item.id === active)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <button
              className="menu-button"
              onClick={() => setMenuOpen((current) => !current)}
              type="button"
              title={menuOpen ? 'Hide menu' : 'Show menu'}
            >
              {menuOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
              {menuOpen ? 'Hide Menu' : 'Show Menu'}
            </button>
            <button className="icon-button" onClick={loadInitialData} type="button" title="Refresh data">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {error && <Banner tone="danger" message={error} />}
        {loading ? (
          <StatePanel title="Loading report data" copy="Connecting to the local API and preparing the workspace." />
        ) : (
          <>
            {active === 'dashboard' && (
              <Dashboard
                firms={firms}
                history={salesHistory}
                totals={totals}
              />
            )}
            {active === 'sales' && <SalesData rows={salesHistory} />}
            {active === 'firms' && <FirmSetup firms={firms} onSaved={setFirms} />}
            {active === 'history' && (
              <SalesHistory
                firms={firms}
                filters={filters}
                rows={filteredHistory}
                setFilters={setFilters}
                totals={totals}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

function Dashboard({ firms, history, totals }) {
  const firmCount = firms.filter((firm) => firm.name && firm.port).length
  const sampleCount = history.filter((row) => row.source === 'sample').length

  return (
    <section className="stack">
      <div className="metric-grid">
        <Metric label="Configured firms" value={`${firmCount}/4`} />
        <Metric label="Sales rows" value={history.length} />
        <Metric label="Filtered quantity" value={formatNumber(totals.qty)} />
        <Metric label="Filtered amount" value={formatCurrency(totals.amount)} />
      </div>

      {sampleCount > 0 && (
        <Banner
          tone="info"
          message={`${sampleCount} sample sales rows are included so the UI works before live Tally data is fetched.`}
        />
      )}
    </section>
  )
}

function SalesData({ rows }) {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchFrom = !fromDate || row.date >= fromDate
      const matchTo = !toDate || row.date <= toDate
      return matchFrom && matchTo
    })
  }, [fromDate, rows, toDate])

  useEffect(() => {
    setPage(1)
  }, [fromDate, toDate])

  const totals = useMemo(() => {
    const amount = filteredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const qty = filteredRows.reduce((sum, row) => sum + Number(row.qty || 0), 0)
    return { amount, qty }
  }, [filteredRows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / salesPageSize))

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * salesPageSize
    return filteredRows.slice(start, start + salesPageSize)
  }, [filteredRows, page])

  const showingStart = filteredRows.length ? (page - 1) * salesPageSize + 1 : 0
  const showingEnd = Math.min(page * salesPageSize, filteredRows.length)

  return (
    <section className="stack">
      <div className="panel split-panel">
        <div>
          <h2>Sales Report</h2>
        </div>
      </div>

      <div className="panel">
        <div className="form-grid">
          <label>
            From Date
            <input value={fromDate} onChange={(event) => setFromDate(event.target.value)} type="date" />
          </label>
          <label>
            To Date
            <input value={toDate} onChange={(event) => setToDate(event.target.value)} type="date" />
          </label>
        </div>
      </div>

      <div className="metric-grid compact">
        <Metric label="Rows" value={filteredRows.length} />
        <Metric label="Qty" value={formatNumber(totals.qty)} />
        <Metric label="Amount" value={formatCurrency(totals.amount)} />
      </div>

      <div className="panel table-panel">
        <SalesRowsTable rows={paginatedRows} />
        <div className="pagination-bar">
          <span>
            Showing {showingStart}-{showingEnd} of {filteredRows.length}
          </span>
          <div className="pagination-controls">
            <button
              className="secondary-button"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <strong>
              Page {page} / {totalPages}
            </strong>
            <button
              className="secondary-button"
              disabled={page === totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              type="button"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function FirmSetup({ firms, onSaved }) {
  const [draft, setDraft] = useState(firms)
  const [statuses, setStatuses] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setDraft(firms)
  }, [firms])

  function updateFirm(index, field, value) {
    setDraft((current) =>
      current.map((firm, itemIndex) => (itemIndex === index ? { ...firm, [field]: value } : firm)),
    )
  }

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const saved = await apiPost('/api/firms', { firms: draft })
      onSaved(saved)
      setMessage('Firm settings saved.')
    } catch (requestError) {
      setMessage(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function testFirm(firm) {
    setStatuses((current) => ({ ...current, [firm.id]: { busy: true, message: 'Testing...' } }))
    try {
      const result = await apiPost(`/api/firms/${firm.id}/test`, {})
      setStatuses((current) => ({ ...current, [firm.id]: { ok: true, message: result.message } }))
    } catch (requestError) {
      setStatuses((current) => ({ ...current, [firm.id]: { ok: false, message: requestError.message } }))
    }
  }

  return (
    <section className="stack">
      <div className="panel split-panel">
        <div>
          <h2>Four Tally Firms</h2>
          <p>Set each firm name and the Tally HTTP port number used on this PC.</p>
        </div>
        <button className="primary-button" onClick={save} disabled={saving} type="button">
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Firms'}
        </button>
      </div>

      {message && <Banner tone={message.includes('saved') ? 'success' : 'danger'} message={message} />}

      <div className="firm-grid">
        {draft.map((firm, index) => {
          const status = statuses[firm.id]
          return (
            <div className="panel firm-card" key={firm.id}>
              <div className="firm-heading">
                <Building2 size={20} />
                <strong>Firm {index + 1}</strong>
              </div>
              <label>
                Firm Name
                <input value={firm.name} onChange={(event) => updateFirm(index, 'name', event.target.value)} />
              </label>
              <label>
                Port No
                <input
                  inputMode="numeric"
                  value={firm.port}
                  onChange={(event) => updateFirm(index, 'port', event.target.value)}
                />
              </label>
              <button className="secondary-button" onClick={() => testFirm(firm)} type="button">
                <PlugZap size={17} />
                Test Connection
              </button>
              {status && (
                <div className={status.ok ? 'status-text ok' : 'status-text failed'}>
                  {status.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  <span>{status.message}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SalesHistory({ firms, filters, rows, setFilters, totals }) {
  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  function exportCsv() {
    const headers = ['Firm', 'Date', 'Debtor', 'Invoice No', 'Item', 'Part No', 'Qty', 'Rate', 'Amount']
    const lines = rows.map((row) =>
      [row.firm, row.date, row.debtor, row.invoiceNo, row.item, row.partNo, row.qty, row.rate, row.amount]
        .map(csvValue)
        .join(','),
    )
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'tally-sales-history.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="stack">
      <div className="panel split-panel">
        <div>
          <h2>Sales Data History</h2>
          <p>Search, filter, and export item-level sales rows fetched from Tally.</p>
        </div>
        <button className="primary-button" onClick={exportCsv} disabled={!rows.length} type="button">
          <Download size={18} />
          Export CSV
        </button>
      </div>

      <div className="panel">
        <div className="filter-grid">
          <label>
            Firm
            <select value={filters.firm} onChange={(event) => updateFilter('firm', event.target.value)}>
              <option value="all">All Firms</option>
              {firms.map((firm) => (
                <option key={firm.id} value={firm.name}>
                  {firm.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input value={filters.fromDate} onChange={(event) => updateFilter('fromDate', event.target.value)} type="date" />
          </label>
          <label>
            To
            <input value={filters.toDate} onChange={(event) => updateFilter('toDate', event.target.value)} type="date" />
          </label>
          <label>
            Debtor
            <input value={filters.debtor} onChange={(event) => updateFilter('debtor', event.target.value)} />
          </label>
          <label>
            Invoice No
            <input value={filters.invoiceNo} onChange={(event) => updateFilter('invoiceNo', event.target.value)} />
          </label>
          <label>
            Item
            <input value={filters.item} onChange={(event) => updateFilter('item', event.target.value)} />
          </label>
        </div>
      </div>

      <div className="metric-grid compact">
        <Metric label="Rows" value={rows.length} />
        <Metric label="Qty" value={formatNumber(totals.qty)} />
        <Metric label="Amount" value={formatCurrency(totals.amount)} />
      </div>

      <div className="panel table-panel">
        <SalesRowsTable rows={rows} />
      </div>
    </section>
  )
}

function SalesRowsTable({ rows }) {
  if (!rows.length) {
    return (
      <StatePanel
        icon={<Search size={28} />}
        title="No rows found"
        copy="No sales rows match the selected dates."
      />
    )
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Firm</th>
            <th>Date</th>
            <th>Debtor</th>
            <th>Invoice No</th>
            <th>Item</th>
            <th>Part No</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.firm}</td>
              <td>{row.date}</td>
              <td>{row.debtor}</td>
              <td>{row.invoiceNo}</td>
              <td>{row.item}</td>
              <td>{row.partNo}</td>
              <td className="num">{formatNumber(row.qty)}</td>
              <td className="num">{formatCurrency(row.rate)}</td>
              <td className="num">{formatCurrency(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Banner({ tone, message }) {
  return <div className={`banner ${tone}`}>{message}</div>
}

function StatePanel({ icon, title, copy }) {
  return (
    <div className="state-panel">
      {icon}
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  )
}

async function apiGet(url) {
  const response = await fetch(url)
  return parseResponse(response)
}

async function apiPost(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseResponse(response)
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Request failed.')
  return data
}

function includesText(value, query) {
  return String(value || '').toLowerCase().includes(String(query || '').toLowerCase())
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  })
}

function csvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function getPageFromPath() {
  return routeAliases[window.location.pathname] || 'dashboard'
}

export default App
