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
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Notification panel. Each person sees notifications tied to THEIR OWN account:
//  - an admin/approver sees incoming access requests (to approve/deny)
//  - a regular user sees what happened on their account — sheets shared with
//    them, and the outcome of any access request they made.
export default function Notifications({ open, onClose, isApprover, onCount }) {
  const { profile } = useAuth()
  const [tab, setTab] = useState('all')       // all | requests
  const [items, setItems] = useState([])       // normalized notification items
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const me = profile?.id

    // ---- Admin / approver: incoming access requests ----
    if (isApprover) {
      const { data } = await supabase.from('access_requests').select('*')
        .order('created_at', { ascending: false }).limit(100)
      const rows = (data || []).map(r => ({
        id: 'req_' + r.id, kind: 'request', raw: r,
        who: r.requester_name || r.requester_email || 'Someone',
        sheet: r.sheet_name || 'a sheet', status: r.status,
        message: r.message, at: r.created_at, read: r.read,
      }))
      setItems(rows)
      onCount && onCount(rows.filter(x => !x.read && x.status === 'pending').length)
      return
    }

    // ---- Regular user: their own account activity ----
    if (!me) { setItems([]); onCount && onCount(0); return }
    const out = []
    // sheets that were shared with me
    try {
      const { data: acc } = await supabase.from('sheet_access').select('*').eq('user_id', me).limit(200)
      const ids = [...new Set((acc || []).map(a => a.sheet_id))]
      const names = {}
      if (ids.length) {
        const { data: sh } = await supabase.from('sheets').select('id,name').in('id', ids)
        ;(sh || []).forEach(s => { names[s.id] = s.name })
      }
      ;(acc || []).forEach(a => out.push({
        id: 'acc_' + a.id, kind: 'granted',
        sheet: names[a.sheet_id] || 'a sheet', at: a.created_at || a.granted_at || null,
      }))
    } catch { /* ignore */ }
    // access requests I made, and how they were decided
    try {
      const { data: reqs } = await supabase.from('access_requests').select('*')
        .eq('requester_id', me).order('created_at', { ascending: false }).limit(100)
      ;(reqs || []).forEach(r => out.push({
        id: 'myreq_' + r.id, kind: 'myrequest',
        sheet: r.sheet_name || 'a sheet', status: r.status,
        at: r.decided_at || r.created_at,
      }))
    } catch { /* ignore */ }
    out.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    setItems(out)
    onCount && onCount(0)
  }, [isApprover, profile?.id, onCount])

  useEffect(() => { load() }, [load])

  // realtime: refresh when requests OR my access changes
  useEffect(() => {
    const me = profile?.id
    const ch = supabase.channel('notif_rt_' + (me || 'x'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'access_requests' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sheet_access' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, profile?.id])

  // mark requests read when the approver opens the panel
  useEffect(() => {
    if (!open || !isApprover) return
    const ids = items.filter(i => i.kind === 'request' && !i.read).map(i => i.raw.id)
    if (!ids.length) return
    supabase.from('access_requests').update({ read: true }).in('id', ids).then(() => {
      setItems(prev => prev.map(i => i.kind === 'request' ? { ...i, read: true } : i))
      onCount && onCount(0)
    })
  }, [open]) // eslint-disable-line

  async function decide(item, status) {
    const r = item.raw
    setBusy(true)
    await supabase.from('access_requests')
      .update({ status, read: true, decided_at: new Date().toISOString(), decided_by: profile?.id })
      .eq('id', r.id)
    if (status === 'approved' && r.sheet_id && r.requester_id) {
      // grant access on approval (best-effort)
      try {
        await supabase.from('sheet_access').insert({ sheet_id: r.sheet_id, user_id: r.requester_id, granted_by: profile?.id })
      } catch { /* ignore */ }
    }
    setBusy(false)
    load()
  }

  if (!open) return null

  const shown = tab === 'requests'
    ? items.filter(i => (i.kind === 'request' || i.kind === 'myrequest') && i.status === 'pending')
    : items

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
          {shown.map(item => <NotifRow key={item.id} item={item} isApprover={isApprover} busy={busy} onDecide={decide} />)}
        </div>
      </div>
    </>
  )
}

function NotifRow({ item, isApprover, busy, onDecide }) {
  // Someone asked an approver for access
  if (item.kind === 'request') {
    const who = item.who
    const unread = !item.read && item.status === 'pending'
    return (
      <div className={'notif-item' + (unread ? ' unread' : '')}>
        <span className="notif-av" style={{ background: avColor(who) }}>{who.trim().charAt(0).toUpperCase()}</span>
        <div className="notif-body">
          <div className="notif-line">
            <b>{who}</b> requested access to <b>{item.sheet}</b>
            {item.status === 'approved' && <span className="notif-pill ok">Approved</span>}
            {item.status === 'rejected' && <span className="notif-pill no">Denied</span>}
          </div>
          <div className="notif-meta">{fmtDate(item.at)} • {who}</div>
          {item.message && <div className="notif-msg">"{item.message}"</div>}
          {isApprover && item.status === 'pending' && (
            <div className="notif-actions">
              <button className="notif-btn approve" disabled={busy} onClick={() => onDecide(item, 'approved')}>Approve</button>
              <button className="notif-btn deny" disabled={busy} onClick={() => onDecide(item, 'rejected')}>Deny</button>
            </div>
          )}
        </div>
        {unread && <span className="notif-dot" />}
      </div>
    )
  }

  // A sheet was shared with me
  if (item.kind === 'granted') {
    return (
      <div className="notif-item">
        <span className="notif-av" style={{ background: '#0ea5b7' }}>✓</span>
        <div className="notif-body">
          <div className="notif-line">You were given access to <b>{item.sheet}</b></div>
          <div className="notif-meta">{fmtDate(item.at)}</div>
        </div>
      </div>
    )
  }

  // The outcome of an access request I made
  const st = item.status
  return (
    <div className="notif-item">
      <span className="notif-av" style={{ background: st === 'approved' ? '#16a34a' : st === 'rejected' ? '#e11d63' : '#f59e0b' }}>
        {st === 'approved' ? '✓' : st === 'rejected' ? '✕' : '⏳'}
      </span>
      <div className="notif-body">
        <div className="notif-line">
          Your request for <b>{item.sheet}</b> {st === 'approved' ? 'was approved' : st === 'rejected' ? 'was denied' : 'is pending'}
          {st === 'approved' && <span className="notif-pill ok">Approved</span>}
          {st === 'rejected' && <span className="notif-pill no">Denied</span>}
        </div>
        <div className="notif-meta">{fmtDate(item.at)}</div>
      </div>
    </div>
  )
}
