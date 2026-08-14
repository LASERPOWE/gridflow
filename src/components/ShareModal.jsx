import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import SimpleModal from './SimpleModal.jsx'

// Share a sheet by email: grants access (now, or pending until they sign in)
// and opens a pre-filled notification email in the user's mail app.
export default function ShareModal({ sheet, onClose }) {
  const { profile } = useAuth()
  const [email, setEmail] = useState('')
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
  }, [sheet.id])
  useEffect(() => { load() }, [load])

  function notify(toEmail) {
    const link = window.location.origin
    const subj = `You've been given access to "${sheet.name}"`
    const body =
      `Hi,\n\nYou now have access to the sheet "${sheet.name}" on smartsheet by Laser Power.\n\n` +
      `Open it here: ${link}\nSign in with this email (${toEmail}) to view it.\n\n` +
      `— ${profile?.full_name || profile?.email || 'Admin'}`
    const a = document.createElement('a')
    a.href = `mailto:${toEmail}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`
    document.body.appendChild(a); a.click(); a.remove()
  }

  async function share(e) {
    e.preventDefault()
    const em = email.trim().toLowerCase()
    if (!em) return
    setBusy(true); setMsg('')
    const { data: p } = await supabase.from('profiles').select('id,email').ilike('email', em).maybeSingle()
    if (p) {
      if (!access.some(a => a.user_id === p.id)) {
        const { error } = await supabase.from('sheet_access').insert({ user_id: p.id, sheet_id: sheet.id, granted_by: profile?.id })
        if (error) { setBusy(false); return setMsg('Error: ' + error.message) }
      }
      setMsg(`✓ Access granted to ${em}. Opening an email to notify them…`)
    } else {
      const { error } = await supabase.from('pending_shares').insert({ email: em, sheet_id: sheet.id })
      if (error) { setBusy(false); return setMsg('Error: ' + error.message) }
      setMsg(`✓ Invited ${em}. They'll get access automatically when they sign in. Opening an email…`)
    }
    notify(em)
    setEmail(''); setBusy(false); load()
  }

  async function removeAccess(id) { setBusy(true); await supabase.from('sheet_access').delete().eq('id', id); setBusy(false); load() }
  async function removePending(id) { setBusy(true); await supabase.from('pending_shares').delete().eq('id', id); setBusy(false); load() }

  return (
    <SimpleModal title={`Share "${sheet.name}"`} onClose={onClose}>
      <form onSubmit={share} className="share-add">
        <input className="fr-in" type="email" placeholder="person@company.com" value={email}
          onChange={e => setEmail(e.target.value)} autoFocus required style={{ flex: 1 }} />
        <button className="btn" disabled={busy}>Share</button>
      </form>
      {msg && <div className="share-msg">{msg}</div>}

      <div className="share-sec">People with access</div>
      {access.length === 0 && pending.length === 0 && <div className="share-empty">No one added yet. Enter an email above to share.</div>}
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
      <p className="share-note">The person gets access when they sign in with this email. A notification email opens in your mail app — just press send.</p>
    </SimpleModal>
  )
}
