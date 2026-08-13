import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'

const SUPER_ADMIN_EMAIL = 'samrat.dey@laserpowerinfra.com'

export default function AdminPanel() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('users')   // users | access | allowlist | requests | migrate
  const [users, setUsers] = useState([])
  const [allow, setAllow] = useState([])
  const [reqs, setReqs] = useState([])
  const [tree, setTree] = useState([])      // orgs->depts->workspaces->sheets
  const [grants, setGrants] = useState([])  // sheet_access rows
  const [pickUser, setPickUser] = useState('')  // user_id selected in Access tab
  const [newEmail, setNewEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [u, a, r, o, d, w, s, g] = await Promise.all([
      supabase.from('profiles').select('*').order('email'),
      supabase.from('allowed_emails').select('*').order('created_at', { ascending: false }),
      supabase.from('access_requests').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('organisations').select('*').order('name'),
      supabase.from('departments').select('*').order('name'),
      supabase.from('workspaces').select('*').order('name'),
      supabase.from('sheets').select('*').order('name'),
      supabase.from('sheet_access').select('*'),
    ])
    setUsers(u.data || []); setAllow(a.data || []); setReqs(r.data || [])
    const O = o.data || [], D = d.data || [], W = w.data || [], S = s.data || []
    setTree(O.map(x => ({ ...x, depts: D.filter(y => y.org_id === x.id).map(y => ({
      ...y, wss: W.filter(z => z.dept_id === y.id).map(z => ({ ...z, sheets: S.filter(sh => sh.workspace_id === z.id) })),
    })) })))
    setGrants(g.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const nonSuper = users.filter(u => u.email !== SUPER_ADMIN_EMAIL)

  async function setRole(u, role) {
    if (u.email === SUPER_ADMIN_EMAIL) { setMsg('Super Admin is locked.'); return }
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ global_role: role }).eq('id', u.id)
    setBusy(false)
    if (error) return setMsg('Error: ' + error.message)
    setMsg('Updated'); load()
  }

  // ---- access grants ----
  const userGrants = grants.filter(g => g.user_id === pickUser)
  const hasSheet = (sid) => userGrants.some(g => g.sheet_id === sid)
  const hasWs = (wid) => userGrants.some(g => g.workspace_id === wid)

  async function toggleSheet(sid) {
    if (!pickUser) return
    setBusy(true)
    const existing = userGrants.find(g => g.sheet_id === sid)
    if (existing) await supabase.from('sheet_access').delete().eq('id', existing.id)
    else await supabase.from('sheet_access').insert({ user_id: pickUser, sheet_id: sid, granted_by: profile?.id })
    setBusy(false); load()
  }
  async function toggleWs(wid) {
    if (!pickUser) return
    setBusy(true)
    const existing = userGrants.find(g => g.workspace_id === wid)
    if (existing) await supabase.from('sheet_access').delete().eq('id', existing.id)
    else await supabase.from('sheet_access').insert({ user_id: pickUser, workspace_id: wid, granted_by: profile?.id })
    setBusy(false); load()
  }

  async function addEmail(e) {
    e.preventDefault(); if (!newEmail.trim()) return
    setBusy(true)
    const { error } = await supabase.from('allowed_emails').upsert({ email: newEmail.trim().toLowerCase(), role: 'user', added_by: profile?.id })
    setBusy(false)
    if (error) return setMsg('Error: ' + error.message)
    setNewEmail(''); setMsg('Email allowed'); load()
  }
  async function removeEmail(email) { setBusy(true); await supabase.from('allowed_emails').delete().eq('email', email); setBusy(false); load() }
  async function decideReq(r, status) {
    setBusy(true)
    await supabase.from('access_requests').update({ status, read: true, decided_at: new Date().toISOString(), decided_by: profile?.id }).eq('id', r.id)
    if (status === 'approved' && r.requester_id && r.sheet_id) {
      try { await supabase.from('sheet_access').insert({ user_id: r.requester_id, sheet_id: r.sheet_id, granted_by: profile?.id }) } catch { /* ignore dup */ }
    }
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
        <button className={tab === 'access' ? 'on' : ''} onClick={() => setTab('access')}>Access</button>
        <button className={tab === 'allowlist' ? 'on' : ''} onClick={() => setTab('allowlist')}>Allowed emails ({allow.length})</button>
        <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>Requests ({pending.length})</button>
        <button className={tab === 'migrate' ? 'on' : ''} onClick={() => setTab('migrate')}>Migrate from Smartsheet</button>
      </div>
      {msg && <div className="admin-msg">{msg}</div>}

      {tab === 'users' && (
        <div className="admin-card">
          <p className="admin-hint">Super Admin sees everything. Users see only what you grant in the <b>Access</b> tab.</p>
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {users.map(u => {
                const locked = u.email === SUPER_ADMIN_EMAIL
                return (
                  <tr key={u.id}>
                    <td>{u.full_name || '—'}</td>
                    <td>{u.email}</td>
                    <td>{locked ? <span className="admin-lock">🔒 Super Admin</span> : (
                      <select value={u.global_role === 'super_admin' ? 'user' : (u.global_role || 'user')} disabled={busy} onChange={e => setRole(u, e.target.value)}>
                        <option value="user">user</option>
                      </select>
                    )}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'access' && (
        <div className="admin-card">
          <p className="admin-hint">Choose a user, then grant folders or individual sheets. Users see only what's checked.</p>
          <select className="access-user" value={pickUser} onChange={e => setPickUser(e.target.value)}>
            <option value="">— Select a user —</option>
            {nonSuper.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email} ({u.email})</option>)}
          </select>
          {pickUser && (
            <div className="access-tree">
              {tree.map(o => (
                <div key={o.id}>
                  <div className="access-org">🏢 {o.name}</div>
                  {o.depts.map(d => (
                    <div key={d.id}>
                      <div className="access-dept">📁 {d.name}</div>
                      {d.wss.map(w => (
                        <div key={w.id} className="access-ws-block">
                          <label className="access-row ws">
                            <input type="checkbox" checked={hasWs(w.id)} disabled={busy} onChange={() => toggleWs(w.id)} />
                            <span>📂 {w.name} <em>(whole folder)</em></span>
                          </label>
                          {w.sheets.map(s => (
                            <label key={s.id} className={'access-row sheet' + (hasWs(w.id) ? ' inherited' : '')}>
                              <input type="checkbox" checked={hasWs(w.id) || hasSheet(s.id)} disabled={busy || hasWs(w.id)} onChange={() => toggleSheet(s.id)} />
                              <span>▦ {s.name}</span>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'allowlist' && (
        <div className="admin-card">
          <form className="admin-add" onSubmit={addEmail}>
            <input type="email" placeholder="person@company.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
            <button className="btn" disabled={busy}>Add email</button>
          </form>
          <p className="admin-hint">Optional allowlist. (Currently anyone can sign in with Google.)</p>
          <table className="admin-table">
            <thead><tr><th>Email</th><th></th></tr></thead>
            <tbody>
              {allow.map(a => (
                <tr key={a.email}><td>{a.email}</td>
                  <td><button className="admin-del" disabled={busy} onClick={() => removeEmail(a.email)}>Remove</button></td></tr>
              ))}
              {allow.length === 0 && <tr><td colSpan={2} className="admin-empty">None.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'requests' && (
        <div className="admin-card">
          {pending.length === 0 && <div className="admin-empty" style={{ padding: 24 }}>No pending requests.</div>}
          {pending.map(r => (
            <div key={r.id} className="admin-req">
              <div><b>{r.requester_name || r.requester_email}</b> requested access to <b>{r.sheet_name || 'a sheet'}</b>
                {r.message && <div className="admin-req-msg">"{r.message}"</div>}</div>
              <div className="admin-req-actions">
                <button className="btn sm" disabled={busy} onClick={() => decideReq(r, 'approved')}>Approve &amp; grant</button>
                <button className="btn ghost sm" disabled={busy} onClick={() => decideReq(r, 'rejected')}>Deny</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'migrate' && (
        <div className="admin-card">
          <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Migrate from Smartsheet</h3>
          <p className="admin-hint">Bring all sheets, columns and rows from your Smartsheet organisation into this app.</p>
          <div className="migrate-steps">
            <div className="migrate-step"><b>1. Connect</b> — Paste a Smartsheet API token (Smartsheet → Personal Settings → API Access).</div>
            <div className="migrate-step"><b>2. Scan</b> — We list every workspace, folder and sheet in your Smartsheet org.</div>
            <div className="migrate-step"><b>3. Map</b> — Each Smartsheet sheet becomes a sheet here; columns and rows are copied 1:1.</div>
            <div className="migrate-step"><b>4. Import</b> — Data is pulled in batches; you can re-run to sync updates.</div>
          </div>
          <button className="btn" style={{ marginTop: 16 }} disabled title="Coming soon">🚀 Start migration (coming soon)</button>
          <p style={{ marginTop: 10, color: '#69707d', fontSize: 12 }}>Planned for a future update.</p>
        </div>
      )}
    </div>
  )
}
