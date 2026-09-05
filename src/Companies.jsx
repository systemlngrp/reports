import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, RefreshCw, Search } from 'lucide-react'

export default function Companies() {
  const [companies, setCompanies] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

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

  useEffect(() => { setPage(1) }, [query, pageSize])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  useEffect(() => { setPage((current) => Math.min(current, totalPages)) }, [totalPages])
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const showingStart = filtered.length ? (page - 1) * pageSize + 1 : 0
  const showingEnd = Math.min(page * pageSize, filtered.length)

  return <section className="stack">
    <div className="master-title"><h2>COMPANIES MASTER</h2><button className="secondary-button" onClick={load} type="button"><RefreshCw size={15} /> Refresh</button></div>
    {error && <div className="banner danger">{error}</div>}
    <div className="panel company-search"><div className="search-input"><Search size={15} /><input aria-label="Search companies" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies..." /></div></div>
    <div className="company-stats"><CompanyMetric label="Total Records" value={companies.length} /><CompanyMetric label="Filtered Records" value={filtered.length} /><CompanyMetric label="Showing" value={visible.length} /><CompanyMetric label="Page" value={`${page} / ${totalPages}`} /></div>
    {loading ? <div className="state-panel"><Building2 size={28} /><h2>Loading companies</h2></div> : <div className="company-table-shell"><div className="table-wrap company-table-scroll"><table className="companies-table"><thead><tr><th>Sl No</th><th>Company</th><th>Contact Person</th><th>Contact Number</th><th>Email ID</th><th>Address</th><th>District</th><th>State</th><th>GST No</th><th>Sales Person</th><th>Target</th></tr></thead><tbody>
      {visible.map((row, index) => <tr key={row.id}><td className="num">{showingStart + index}</td><td className="customer-name">{row.company}</td><td>{row.contactPerson}</td><td>{row.contactNumber}</td><td>{row.email}</td><td className="address-cell">{row.address}</td><td>{row.district}</td><td>{row.state}</td><td>{row.gstNo}</td><td>{row.salesPerson}</td><td className="num">{currency(row.target)}</td></tr>)}
      {!filtered.length && <tr><td colSpan="11">No companies found. Run the Companies sync from Google Sheets, then refresh this page.</td></tr>}
    </tbody></table></div><div className="company-pager"><span>Showing {showingStart}-{showingEnd} of {filtered.length}</span><div><label>Rows <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option>25</option><option>50</option><option>100</option></select></label><button disabled={page === 1} onClick={() => setPage((current) => current - 1)} type="button">Prev</button><strong>Page {page} / {totalPages}</strong><button disabled={page === totalPages} onClick={() => setPage((current) => current + 1)} type="button">Next</button></div></div></div>}
  </section>
}

function CompanyMetric({ label, value }) { return <div className="company-stat"><span>{label}</span><strong>{value}</strong></div> }
function currency(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0)) }
