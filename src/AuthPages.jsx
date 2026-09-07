import { useEffect, useMemo, useState } from 'react'
import { KeyRound, LogIn, Save, Search, ShieldCheck, UserPlus } from 'lucide-react'

const permissionGroups = [
  { label: 'Reports', pages: [['sales-tracker', 'Sales Tracker'], ['sales-person', 'Sales Person Wise'], ['performance', 'Performance'], ['firm-wise', 'Firm Wise Report'], ['credit-note-view', 'Credit Note View'], ['item-wise-sales', 'Item Wise Sales']] },
  { label: 'Master', pages: [['companies', 'Companies'], ['firms', 'Firms']] },
  { label: 'Target', pages: [['target-master', 'Target Master'], ['custom-target', 'Custom Target'], ['sales-man-target', 'Target by Salesman'], ['weekly-monthly-target', 'Weekly/Monthly Target']] },
  { label: 'Other pages', pages: [['dashboard', 'Dashboard'], ['intercompany', 'Intercompany'], ['sales', 'Sales'], ['receipts', 'Receipts'], ['credit-notes', 'Credit Notes'], ['history', 'Tally Sales History']] },
]

export function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setLoading(true); setError('')
    try {
      const user = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(form) })
      onLogin(user)
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }

  return <main className="auth-screen">
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-mark"><ShieldCheck size={30} /></div>
      <h1>Report Login</h1>
      <p>Sign in to access your permitted reports.</p>
      {error && <div className="auth-error">{error}</div>}
      <label>Email address<input autoComplete="email" required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Password<input autoComplete="current-password" minLength={10} required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
      <button className="auth-primary" disabled={loading} type="submit"><LogIn size={17} />{loading ? 'Signing in...' : 'Sign in'}</button>
    </form>
  </main>
}

export function SettingsPage({ user, onUserChange, forced = false, onLogout }) {
  const [name, setName] = useState(user.displayName)
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function saveProfile(event) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    try { const updated = await api('/api/auth/profile', { method: 'PUT', body: JSON.stringify({ displayName: name }) }); onUserChange(updated); setMessage('Profile updated.') }
    catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }
  async function changePassword(event) {
    event.preventDefault(); setError(''); setMessage('')
    if (passwords.newPassword !== passwords.confirm) return setError('New passwords do not match.')
    setSaving(true)
    try {
      const updated = await api('/api/auth/password', { method: 'PUT', body: JSON.stringify(passwords) })
      onUserChange(updated); setPasswords({ currentPassword: '', newPassword: '', confirm: '' }); setMessage('Password changed successfully.')
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  return <section className={forced ? 'auth-screen' : 'settings-page'}>
    <div className={forced ? 'auth-card settings-card' : 'management-card'}>
      <h2>{forced ? 'Change temporary password' : 'Settings'}</h2>
      <p>{forced ? 'You must set a new password before opening reports.' : `Signed in as ${user.email}`}</p>
      {error && <div className="auth-error">{error}</div>}{message && <div className="auth-success">{message}</div>}
      {!forced && <form className="management-form" onSubmit={saveProfile}><h3>Profile</h3><label>Display name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><button className="auth-primary" disabled={saving}><Save size={16} />Save profile</button></form>}
      <form className="management-form" onSubmit={changePassword}>
        <h3>Password</h3>
        <label>Current password<input autoComplete="current-password" required type="password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label>
        <label>New password<input autoComplete="new-password" minLength={10} required type="password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /></label>
        <label>Confirm new password<input autoComplete="new-password" minLength={10} required type="password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} /></label>
        <button className="auth-primary" disabled={saving}><KeyRound size={16} />{saving ? 'Saving...' : 'Change password'}</button>
      </form>
      {forced && <button className="secondary-button forced-logout" onClick={onLogout} type="button">Logout</button>}
    </div>
  </section>
}

const blankUser = { displayName: '', email: '', password: '', isAdmin: false, isActive: true, permissions: [] }

export function UsersPage({ currentUser }) {
  const [users, setUsers] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blankUser)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pageSize = 10
  useEffect(() => { loadUsers() }, [])
  async function loadUsers() { try { setUsers(await api('/api/users')) } catch (requestError) { setError(requestError.message) } }
  const filtered = useMemo(() => users.filter((item) => `${item.displayName} ${item.email}`.toLowerCase().includes(search.toLowerCase())), [search, users])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize)
  function edit(user) { setEditing(user.id); setForm({ ...user, password: '' }); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function reset() { setEditing(null); setForm(blankUser); setError('') }
  function togglePermission(id) { setForm((value) => ({ ...value, permissions: value.permissions.includes(id) ? value.permissions.filter((pageId) => pageId !== id) : [...value.permissions, id] })) }
  async function save(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await api(editing ? `/api/users/${editing}` : '/api/users', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) })
      await loadUsers(); reset()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }
  async function resetPassword(user) {
    const password = window.prompt(`Enter a temporary password for ${user.displayName} (minimum 10 characters):`)
    if (!password) return
    try { await api(`/api/users/${user.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }); await loadUsers(); window.alert('Temporary password saved. The user must change it at next login.') }
    catch (requestError) { setError(requestError.message) }
  }

  return <section className="users-page">
    <div className="management-card"><div className="management-heading"><div><h2>{editing ? 'Edit user' : 'Create user'}</h2><p>Assign access only to the pages this user needs.</p></div>{editing && <button className="secondary-button" onClick={reset}>Cancel edit</button>}</div>
      {error && <div className="auth-error">{error}</div>}
      <form className="user-form" onSubmit={save}>
        <label>Display name<input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
        <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        {!editing && <label>Temporary password<input minLength={10} required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>}
        <div className="user-switches"><label><input checked={form.isAdmin} type="checkbox" onChange={(event) => setForm({ ...form, isAdmin: event.target.checked })} /> Administrator</label>{editing && <label><input checked={form.isActive} disabled={editing === currentUser.id} type="checkbox" onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Active</label>}</div>
        <div className="permission-grid">{permissionGroups.map((group) => <fieldset key={group.label}><legend>{group.label}</legend>{group.pages.map(([id, label]) => <label key={id}><input checked={form.permissions.includes(id)} disabled={form.isAdmin} type="checkbox" onChange={() => togglePermission(id)} /> {label}</label>)}</fieldset>)}</div>
        <button className="auth-primary" disabled={saving}><UserPlus size={16} />{saving ? 'Saving...' : editing ? 'Save user' : 'Create user'}</button>
      </form>
    </div>
    <div className="management-card"><div className="management-heading"><h2>Users</h2><label className="user-search"><Search size={16} /><input placeholder="Search users" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label></div>
      <div className="table-scroll"><table className="user-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Access</th><th>Actions</th></tr></thead><tbody>{shown.map((user) => <tr key={user.id}><td>{user.displayName}</td><td>{user.email}</td><td>{user.isAdmin ? 'Administrator' : 'User'}</td><td>{user.isActive ? 'Active' : 'Inactive'}{user.mustChangePassword ? ' · Password change due' : ''}</td><td>{user.isAdmin ? 'All pages' : `${user.permissions.length} pages`}</td><td><button className="table-action" onClick={() => edit(user)}>Edit</button><button className="table-action" onClick={() => resetPassword(user)}>Reset password</button></td></tr>)}</tbody></table></div>
      {!shown.length && <p className="empty-copy">No users match your search.</p>}<div className="simple-pagination"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button></div>
    </div>
  </section>
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || 'Request failed.')
  return payload
}
