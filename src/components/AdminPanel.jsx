import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'

const SUPER_ADMIN_EMAIL = 'samrat.dey@laserpowerinfra.com'

// Deterministic avatar colour from a name/email (matches the "coloured initial" look).
const AV_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#3b82f6']
function avatarColor(s) { let h = 0; const t = String(s || ''); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0; return AV_COLORS[h % AV_COLORS.length] }
function initials(name, email) { const base = (name || email || 'U').trim(); const parts = base.split(/\s+/); return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || base.slice(0, 2).toUpperCase() }
function fmtJoined(ts) { if (!ts) return '—'; try { return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '—' } }
// Role label + colour for the badge.
function roleInfo(u) {
  if (u.email === SUPER_ADMIN_EMAIL) return { label: 'Owner', cls: 'owner' }
  if (u.global_role === 'super_admin') return { label: 'Super Admin', cls: 'super' }
  if (u.global_role === 'admin') return { label: 'Admin', cls: 'admin' }
  return { label: 'User', cls: 'user' }
}

export default function AdminPanel() {
  const { profile } = useAuth()
  const isSuper = profile?.email === SUPER_ADMIN_EMAIL   // only the Super Admin may remove users
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
  const [confirmUser, setConfirmUser] = useState(null)  // user id pending remove confirmation
  const [userQuery, setUserQuery] = useState('')        // search box on the Users tab

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

  // Remove a user entirely: revoke all their sheet access, then delete the profile.
  // Only the Super Admin is allowed to do this.
  async function removeUser(u) {
    if (!isSuper) { setMsg('Only the Super Admin can remove users.'); setConfirmUser(null); return }
    if (u.email === SUPER_ADMIN_EMAIL) { setMsg('Super Admin is locked.'); setConfirmUser(null); return }
    setBusy(true)
    await supabase.from('sheet_access').delete().eq('user_id', u.id)
    const { error } = await supabase.from('profiles').delete().eq('id', u.id)
    setBusy(false); setConfirmUser(null)
    if (error) return setMsg('Error: ' + error.message)
    setMsg(`Removed ${u.full_name || u.email}`); load()
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

      {tab === 'users' && (() => {
        const q = userQuery.trim().toLowerCase()
        const isAdminRole = u => u.email === SUPER_ADMIN_EMAIL || u.global_role === 'super_admin' || u.global_role === 'admin'
        const match = u => !q || (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
        const admins = users.filter(u => isAdminRole(u) && match(u))
        const basics = users.filter(u => !isAdminRole(u) && match(u))
        const manageAccess = (u) => { setPickUser(u.id); setTab('access') }
        const renderRow = (u) => {
          const r = roleInfo(u); const locked = u.email === SUPER_ADMIN_EMAIL
          return (
            <div className="u-row" key={u.id}>
              <div className="u-id">
                <span className="u-avatar" style={{ background: avatarColor(u.email) }}>{initials(u.full_name, u.email)}</span>
                <div className="u-idtext">
                  <div className="u-name">{u.full_name || 'Unnamed'} <span className={'u-badge ' + r.cls}>{r.label}</span></div>
                  <div className="u-email">{u.email}</div>
                </div>
              </div>
              <div className="u-joined">Joined {fmtJoined(u.created_at)}</div>
              <div className="u-actions">
                <button className="u-act" title="Grant / manage this user's sheet access" onClick={() => manageAccess(u)}>🔑 Access</button>
                {isSuper && !locked && (confirmUser === u.id
                  ? <span className="u-confirm"><button className="admin-del" disabled={busy} onClick={() => removeUser(u)}>Confirm</button><button className="btn ghost sm" disabled={busy} onClick={() => setConfirmUser(null)}>Cancel</button></span>
                  : <button className="u-act danger" title="Remove user" onClick={() => setConfirmUser(u.id)}>🗑</button>)}
              </div>
            </div>
          )
        }
        return (
          <div className="admin-card ucard">
            <div className="u-toolbar">
              <div className="u-count"><b>{users.length}</b> users · <b>{admins.length}</b> admin · <b>{basics.length}</b> basic</div>
              <input className="u-search" placeholder="🔍  Search name or email…" value={userQuery} onChange={e => setUserQuery(e.target.value)} />
            </div>

            <div className="u-sec">
              <span className="u-sec-tag admin-tag">Admin Users</span>
              <span className="u-legend"><i className="dot owner" />Owner <i className="dot super" />Super Admin <i className="dot admin" />Admin</span>
            </div>
            <div className="ulist">
              {admins.length ? admins.map(renderRow) : <div className="admin-empty">No admins match.</div>}
            </div>

            <div className="u-sec">
              <span className="u-sec-tag basic-tag">Basic Users</span>
              <span className="u-legend">{basics.length} shown · access granted per sheet</span>
            </div>
            <div className="ulist">
              {basics.length ? basics.map(renderRow) : <div className="admin-empty">No basic users match.</div>}
            </div>
          </div>
        )
      })()}

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
