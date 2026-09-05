import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, RefreshCw, Search } from 'lucide-react'

export default function Companies() {
  const [companies, setCompanies] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/companies')
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Unable to load companies.')
      setCompanies(data)
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('en-IN')
    if (!needle) return companies
    return companies.filter((row) => [row.company, row.id, row.district, row.state, row.gstNo, row.contactPerson, row.contactNumber, row.salesPerson].some((value) => String(value || '').toLocaleLowerCase('en-IN').includes(needle)))
  }, [companies, query])

  const totalTarget = companies.reduce((sum, row) => sum + Number(row.target || 0), 0)
  const states = new Set(companies.map((row) => row.state).filter(Boolean)).size

  return <section className="stack">
    <div className="panel split-panel"><div><h2>Companies</h2><p>Company master synchronized from the Companies tab in Google Sheets.</p></div><button className="primary-button" onClick={load} type="button"><RefreshCw size={17} /> Refresh</button></div>
    {error && <div className="banner danger">{error}</div>}
    <div className="metric-grid compact"><CompanyMetric label="Companies" value={companies.length} /><CompanyMetric label="States" value={states} /><CompanyMetric label="Combined Target" value={currency(totalTarget)} /><CompanyMetric label="Last Sync" value={companies[0]?.syncedAt || 'Not synced'} /></div>
    <div className="panel company-search"><label>Search Companies<div className="search-input"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Company, ID, GST, location, contact or salesperson" /></div></label></div>
    {loading ? <div className="state-panel"><Building2 size={28} /><h2>Loading companies</h2></div> : <div className="panel table-panel"><div className="table-heading"><h2>Company Master ({filtered.length})</h2></div><div className="table-wrap"><table className="companies-table"><thead><tr><th>Id</th><th>Company</th><th>District</th><th>State</th><th>GST No</th><th>Contact Person</th><th>Contact Number</th><th>Email</th><th>Sales Person</th><th>Target</th><th>Synced At</th></tr></thead><tbody>
      {filtered.map((row) => <tr key={row.id}><td>{row.id}</td><td className="customer-name">{row.company}</td><td>{row.district}</td><td>{row.state}</td><td>{row.gstNo}</td><td>{row.contactPerson}</td><td>{row.contactNumber}</td><td>{row.email}</td><td>{row.salesPerson}</td><td className="num">{currency(row.target)}</td><td>{row.syncedAt}</td></tr>)}
      {!filtered.length && <tr><td colSpan="11">No companies found. Run the Companies sync from Google Sheets, then refresh this page.</td></tr>}
    </tbody></table></div></div>}
  </section>
}

function CompanyMetric({ label, value }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div> }
function currency(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0)) }
