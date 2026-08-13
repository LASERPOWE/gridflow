import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'

// super_admin is intentionally NOT selectable — it stays locked to one person.
const ROLES = ['org_admin', 'dept_admin', 'manager', 'editor', 'viewer', 'contractor']
const ADMIN_ROLES = ['super_admin', 'org_admin', 'dept_admin', 'manager']
const SUPER_ADMIN_EMAIL = 'samrat.dey@laserpowerinfra.com'
const ADMIN_CAP = 5

export default function AdminPanel() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('users')      // users | allowlist | requests | migrate
  const [users, setUsers] = useState([])
  const [allow, setAllow] = useState([])
  const [reqs, setReqs] = useState([])
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('viewer')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [u, a, r] = await Promise.all([
      supabase.from('profiles').select('*').order('email'),
      supabase.from('allowed_emails').select('*').order('created_at', { ascending: false }),
      supabase.from('access_requests').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    setUsers(u.data || []); setAllow(a.data || []); setReqs(r.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const adminCount = users.filter(u => ADMIN_ROLES.includes(u.global_role)).length

  async function changeRole(u, role) {
    // Guard 1: super_admin is locked to the one account.
    if (u.email === SUPER_ADMIN_EMAIL) { setMsg('Super Admin is locked and cannot be changed.'); return }
    if (role === 'super_admin') { setMsg('Only the locked Super Admin account can have that role.'); return }
    // Guard 2: enforce the admin cap when promoting to an admin role.
    const wasAdmin = ADMIN_ROLES.includes(u.global_role)
    const willBeAdmin = ADMIN_ROLES.includes(role)
    if (!wasAdmin && willBeAdmin && adminCount >= ADMIN_CAP) {
      setMsg(`Admin limit reached (${ADMIN_CAP}). Remove an admin first.`); return
    }
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ global_role: role }).eq('id', u.id)
    setBusy(false)
    if (error) return setMsg('Error: ' + error.message)
    setMsg('Role updated'); load()
  }
  async function addEmail(e) {
    e.preventDefault(); if (!newEmail.trim()) return
    setBusy(true)
    const { error } = await supabase.from('allowed_emails')
      .upsert({ email: newEmail.trim().toLowerCase(), role: newRole, added_by: profile?.id })
    setBusy(false)
    if (error) return setMsg('Error: ' + error.message)
    setNewEmail(''); setMsg('Email allowed'); load()
  }
  async function removeEmail(email) {
    setBusy(true)
    await supabase.from('allowed_emails').delete().eq('email', email)
    setBusy(false); load()
  }
  async function decideReq(r, status) {
    setBusy(true)
    await supabase.from('access_requests').update({ status, read: true, decided_at: new Date().toISOString(), decided_by: profile?.id }).eq('id', r.id)
    setBusy(false); load()
  }

  const pending = reqs.filter(r => r.status === 'pending')

  return (
    <div className="admin">
      <div className="admin-head">
        <h1>Admin</h1>
        <p>Manage users, access and requests</p>
      </div>
      <div className="admin-tabs">
        <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Users ({users.length})</button>
        <button className={tab === 'allowlist' ? 'on' : ''} onClick={() => setTab('allowlist')}>Allowed emails ({allow.length})</button>
        <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>Requests ({pending.length})</button>
        <button className={tab === 'migrate' ? 'on' : ''} onClick={() => setTab('migrate')}>Migrate from Smartsheet</button>
      </div>
      {msg && <div className="admin-msg">{msg}</div>}

      {tab === 'users' && (
        <div className="admin-card">
          <p className="admin-hint">Admins: <b>{adminCount}/{ADMIN_CAP}</b> used. Super Admin is locked to one account.</p>
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {users.map(u => {
                const locked = u.email === SUPER_ADMIN_EMAIL
                return (
                  <tr key={u.id}>
                    <td>{u.full_name || '—'}</td>
                    <td>{u.email}</td>
                    <td>
                      {locked ? (
                        <span className="admin-lock">🔒 Super Admin</span>
                      ) : (
                        <select value={u.global_role || 'viewer'} disabled={busy}
                          onChange={e => changeRole(u, e.target.value)}>
                          {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                )
              })}
              {users.length === 0 && <tr><td colSpan={3} className="admin-empty">No users yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'allowlist' && (
        <div className="admin-card">
          <form className="admin-add" onSubmit={addEmail}>
            <input type="email" placeholder="person@company.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
            <select value={newRole} onChange={e => setNewRole(e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
            <button className="btn" disabled={busy}>Add email</button>
          </form>
          <p className="admin-hint">Only these emails can sign in (via Google or password). Others are denied.</p>
          <table className="admin-table">
            <thead><tr><th>Email</th><th>Role on signup</th><th></th></tr></thead>
            <tbody>
              {allow.map(a => (
                <tr key={a.email}>
                  <td>{a.email}</td>
                  <td>{(a.role || 'viewer').replace(/_/g, ' ')}</td>
                  <td><button className="admin-del" disabled={busy} onClick={() => removeEmail(a.email)}>Remove</button></td>
                </tr>
              ))}
              {allow.length === 0 && <tr><td colSpan={3} className="admin-empty">No allowed emails yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'requests' && (
        <div className="admin-card">
          {pending.length === 0 && <div className="admin-empty" style={{ padding: 24 }}>No pending requests.</div>}
          {pending.map(r => (
            <div key={r.id} className="admin-req">
              <div>
                <b>{r.requester_name || r.requester_email}</b> requested access to <b>{r.sheet_name || 'a sheet'}</b>
                {r.message && <div className="admin-req-msg">"{r.message}"</div>}
              </div>
              <div className="admin-req-actions">
                <button className="btn sm" disabled={busy} onClick={() => decideReq(r, 'approved')}>Approve</button>
                <button className="btn ghost sm" disabled={busy} onClick={() => decideReq(r, 'rejected')}>Deny</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'migrate' && (
        <div className="admin-card">
          <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Migrate from Smartsheet</h3>
          <p className="admin-hint">
            Bring all sheets, columns and rows from your Smartsheet organisation into this app.
          </p>
          <div className="migrate-steps">
            <div className="migrate-step"><b>1. Connect</b> — Paste a Smartsheet API token (Smartsheet → Personal Settings → API Access).</div>
            <div className="migrate-step"><b>2. Scan</b> — We list every workspace, folder and sheet in your Smartsheet org.</div>
            <div className="migrate-step"><b>3. Map</b> — Each Smartsheet sheet becomes a sheet here; columns and rows are copied 1:1.</div>
            <div className="migrate-step"><b>4. Import</b> — Data is pulled in batches; you can re-run to sync updates.</div>
          </div>
          <button className="btn" style={{ marginTop: 16 }} disabled
            title="Coming soon">🚀 Start migration (coming soon)</button>
          <p style={{ marginTop: 10, color: '#69707d', fontSize: 12 }}>
            Planned for a future update. The Smartsheet connector and token flow will be enabled here.
          </p>
        </div>
      )}
    </div>
  )
}
