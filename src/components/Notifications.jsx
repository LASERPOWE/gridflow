import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'

const AV = ['#6c63ff', '#8e7dff', '#4f46e5', '#7c3aed', '#e11d63', '#0ea5b7', '#2f5bd6']
function avColor(s) {
  let h = 0
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AV[h % AV.length]
}
function fmtDate(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return '' }
}

// Panel that lists access requests, Smartsheet-style.
export default function Notifications({ open, onClose, isApprover, onCount }) {
  const { profile } = useAuth()
  const [tab, setTab] = useState('all')       // all | requests
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    let q = supabase.from('access_requests').select('*').order('created_at', { ascending: false }).limit(100)
    const { data } = await q
    const rows = data || []
    setItems(rows)
    // unread count = pending & not read (approvers) OR own decided (requester)
    const unread = rows.filter(r => !r.read && r.status === 'pending').length
    onCount && onCount(isApprover ? unread : 0)
  }, [isApprover, onCount])

  useEffect(() => { load() }, [load])

  // realtime refresh
  useEffect(() => {
    const ch = supabase
      .channel('access_requests_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'access_requests' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // mark all read when panel opens (approver only)
  useEffect(() => {
    if (!open || !isApprover) return
    const unreadIds = items.filter(r => !r.read).map(r => r.id)
    if (!unreadIds.length) return
    supabase.from('access_requests').update({ read: true }).in('id', unreadIds).then(() => {
      setItems(prev => prev.map(r => ({ ...r, read: true })))
      onCount && onCount(0)
    })
  }, [open]) // eslint-disable-line

  async function decide(r, status) {
    setBusy(true)
    await supabase.from('access_requests')
      .update({ status, read: true, decided_at: new Date().toISOString(), decided_by: profile?.id })
      .eq('id', r.id)
    if (status === 'approved' && r.sheet_id && r.requester_id) {
      // best-effort auto-grant (ignored if table/cols differ)
      try {
        await supabase.from('access_grants').insert({
          sheet_id: r.sheet_id, user_id: r.requester_id, role: 'viewer', granted_by: profile?.id,
        })
      } catch { /* ignore */ }
    }
    setBusy(false)
    load()
  }

  if (!open) return null

  const shown = tab === 'requests' ? items.filter(r => r.status === 'pending') : items

  return (
    <>
      <div className="notif-overlay" onClick={onClose} />
      <div className="notif-panel" role="dialog" aria-label="Notifications">
        <div className="notif-head">
          <span className="notif-title">Notifications</span>
          <button className="notif-x" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="notif-tabs">
          <button className={'notif-tab' + (tab === 'all' ? ' on' : '')} onClick={() => setTab('all')}>All</button>
          <button className={'notif-tab' + (tab === 'requests' ? ' on' : '')} onClick={() => setTab('requests')}>Requests</button>
        </div>

        <div className="notif-list">
          {shown.length === 0 && <div className="notif-empty">No notifications yet.</div>}
          {shown.map(r => {
            const who = r.requester_name || r.requester_email || 'Someone'
            const sheet = r.sheet_name || 'a sheet'
            const unread = !r.read && r.status === 'pending'
            return (
              <div key={r.id} className={'notif-item' + (unread ? ' unread' : '')}>
                <span className="notif-av" style={{ background: avColor(who) }}>{who.trim().charAt(0).toUpperCase()}</span>
                <div className="notif-body">
                  <div className="notif-line">
                    <b>{who}</b> requested access to <b>{sheet}</b>
                    {r.status === 'approved' && <span className="notif-pill ok">Approved</span>}
                    {r.status === 'rejected' && <span className="notif-pill no">Denied</span>}
                  </div>
                  <div className="notif-meta">{fmtDate(r.created_at)} • {who}</div>
                  {r.message && <div className="notif-msg">"{r.message}"</div>}
                  {isApprover && r.status === 'pending' && (
                    <div className="notif-actions">
                      <button className="notif-btn approve" disabled={busy} onClick={() => decide(r, 'approved')}>Approve</button>
                      <button className="notif-btn deny" disabled={busy} onClick={() => decide(r, 'rejected')}>Deny</button>
                    </div>
                  )}
                </div>
                {unread && <span className="notif-dot" />}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
