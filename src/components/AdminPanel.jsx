import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'

const ROLES = ['super_admin', 'org_admin', 'dept_admin', 'manager', 'editor', 'viewer', 'contractor']

export default function AdminPanel() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('users')      // users | allowlist | requests
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

  async function changeRole(id, role) {
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ global_role: role }).eq('id', id)
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
      </div>
      {msg && <div className="admin-msg">{msg}</div>}

      {tab === 'users' && (
        <div className="admin-card">
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.full_name || '—'}</td>
                  <td>{u.email}</td>
                  <td>
                    <select value={u.global_role || 'viewer'} disabled={busy}
                      onChange={e => changeRole(u.id, e.target.value)}>
                      {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
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
    </div>
  )
}
