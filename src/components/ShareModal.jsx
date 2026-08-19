import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import SimpleModal from './SimpleModal.jsx'

// Share a sheet: pick a registered user from a dropdown (or invite a new person
// by email). Granting inserts sheet_access and sends the person a notification.
export default function ShareModal({ sheet, onClose }) {
  const { profile } = useAuth()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [pick, setPick] = useState('')       // selected registered user id
  const [users, setUsers] = useState([])      // all registered users
  const [access, setAccess] = useState([])
  const [pending, setPending] = useState([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data: sa } = await supabase.from('sheet_access').select('*').eq('sheet_id', sheet.id)
    const rows = (sa || []).filter(x => x.user_id)
    const ids = rows.map(x => x.user_id)
    let profs = []
    if (ids.length) { const { data } = await supabase.from('profiles').select('id,email,full_name').in('id', ids); profs = data || [] }
    setAccess(rows.map(r => ({ ...r, prof: profs.find(p => p.id === r.user_id) })))
    const { data: ps } = await supabase.from('pending_shares').select('*').eq('sheet_id', sheet.id)
    setPending(ps || [])
    // all registered users, for the dropdown
    const { data: all } = await supabase.from('profiles').select('id,email,full_name').order('full_name', { ascending: true })
    setUsers(all || [])
  }, [sheet.id])
  useEffect(() => { load() }, [load])

  // Send a real sign-in email straight from the app (deep-links to this sheet).
  async function sendEmail(toEmail, toName) {
    const redirect = window.location.origin + '/?sheet=' + sheet.id
    const { error } = await supabase.auth.signInWithOtp({
      email: toEmail,
      options: { shouldCreateUser: true, emailRedirectTo: redirect, data: { sheet: sheet.name, to_name: toName || '' } },
    })
    return !error ? true : (error.message || 'send failed')
  }

  // Grant to a registered user picked from the dropdown.
  async function grantPicked() {
    const u = users.find(x => x.id === pick); if (!u) return
    setBusy(true); setMsg('Granting…')
    if (!access.some(a => a.user_id === u.id)) {
      const { error } = await supabase.from('sheet_access').insert({ user_id: u.id, sheet_id: sheet.id, granted_by: profile?.id })
      if (error) { setBusy(false); return setMsg('Error: ' + error.message) }
    }
    const sent = await sendEmail(u.email, u.full_name)
    setMsg(sent === true
      ? `✓ Access granted to ${u.full_name || u.email} — an email has been sent.`
      : `✓ Access granted to ${u.full_name || u.email}. (email: ${sent})`)
    setPick(''); setBusy(false); load()
  }

  // Invite a brand-new person by email (not yet registered).
  async function invite(e) {
    e.preventDefault()
    const em = email.trim().toLowerCase()
    const nm = name.trim()
    if (!em) return
    setBusy(true); setMsg('Sharing…')
    const { data: p } = await supabase.from('profiles').select('id,email').ilike('email', em).maybeSingle()
    if (p) {
      if (!access.some(a => a.user_id === p.id)) {
        const { error } = await supabase.from('sheet_access').insert({ user_id: p.id, sheet_id: sheet.id, granted_by: profile?.id })
        if (error) { setBusy(false); return setMsg('Error: ' + error.message) }
      }
    } else {
      const { error } = await supabase.from('pending_shares').insert({ email: em, sheet_id: sheet.id })
      if (error) { setBusy(false); return setMsg('Error: ' + error.message) }
    }
    const sent = await sendEmail(em, nm)
    if (sent === true) setMsg(`✓ Shared with ${nm ? nm + ' (' + em + ')' : em} — an email has been sent.`)
    else setMsg(`✓ Access granted to ${em}, but the email couldn't send (${sent}).`)
    setEmail(''); setName(''); setBusy(false); load()
  }

  async function removeAccess(id) { setBusy(true); await supabase.from('sheet_access').delete().eq('id', id); setBusy(false); load() }
  async function removePending(id) { setBusy(true); await supabase.from('pending_shares').delete().eq('id', id); setBusy(false); load() }

  // registered users who don't already have access
  const takenIds = new Set(access.map(a => a.user_id))
  const available = users.filter(u => !takenIds.has(u.id))

  return (
    <SimpleModal title={`Share "${sheet.name}"`} onClose={onClose}>
      {/* 1) pick a registered user from the dropdown */}
      <div className="share-sec">Give access to a registered user</div>
      <div className="share-add">
        <select className="fr-in" value={pick} onChange={e => setPick(e.target.value)} style={{ flex: 1 }}>
          <option value="">Select a user…</option>
          {available.map(u => (
            <option key={u.id} value={u.id}>{(u.full_name || u.email)}{u.full_name ? ` — ${u.email}` : ''}</option>
          ))}
        </select>
        <button className="btn" disabled={busy || !pick} onClick={grantPicked}>Give access</button>
      </div>
      {available.length === 0 && <div className="share-note" style={{ marginTop: 4 }}>All registered users already have access to this sheet.</div>}

      {/* 2) invite a brand-new person by email */}
      <div className="share-sec" style={{ marginTop: 14 }}>Or invite someone new by email</div>
      <form onSubmit={invite} className="share-add">
        <input className="fr-in" type="text" placeholder="Name (optional)" value={name}
          onChange={e => setName(e.target.value)} style={{ flex: 1 }} />
        <input className="fr-in" type="email" placeholder="person@company.com" value={email}
          onChange={e => setEmail(e.target.value)} style={{ flex: 1.4 }} />
        <button className="btn" disabled={busy || !email}>Invite</button>
      </form>

      {msg && <div className="share-msg">{msg}</div>}

      <div className="share-sec">People with access</div>
      {access.length === 0 && pending.length === 0 && <div className="share-empty">No one added yet.</div>}
      {access.map(a => (
        <div key={a.id} className="share-row">
          <div><b>{a.prof?.full_name || a.prof?.email || 'User'}</b><span>{a.prof?.email}</span></div>
          <button className="share-x" onClick={() => removeAccess(a.id)} disabled={busy}>Remove</button>
        </div>
      ))}
      {pending.map(p => (
        <div key={p.id} className="share-row">
          <div><b>{p.email}</b><span>pending — gets access on sign-in</span></div>
          <button className="share-x" onClick={() => removePending(p.id)} disabled={busy}>Cancel</button>
        </div>
      ))}
      <p className="share-note">The person is emailed a secure sign-in link that opens straight to this sheet. No mail app needed.</p>
    </SimpleModal>
  )
}
