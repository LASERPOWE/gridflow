import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'

// Small modal: user requests access to the given sheet.
export default function RequestAccess({ sheet, onClose }) {
  const { profile } = useAuth()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  async function send() {
    setBusy(true); setErr('')
    const { error } = await supabase.from('access_requests').insert({
      requester_id: profile?.id,
      sheet_id: sheet?.id || null,
      sheet_name: sheet?.name || null,
      requester_name: profile?.full_name || profile?.email || null,
      requester_email: profile?.email || null,
      message: message || null,
      status: 'pending',
      read: false,
    })
    setBusy(false)
    if (error) return setErr(error.message)
    setDone(true)
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal req-modal" role="dialog">
        <div className="modal-head">
          <span>Request access</span>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>
        {done ? (
          <div className="req-done">
            <div className="req-check">✓</div>
            <p>Request sent. An admin will review it and you'll get access once approved.</p>
            <button className="btn block" onClick={onClose}>Done</button>
          </div>
        ) : (
          <div className="modal-body">
            <p className="req-sub">Requesting access to <b>{sheet?.name || 'this sheet'}</b></p>
            <label>Message (optional)</label>
            <textarea rows={3} value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Why do you need access?" />
            {err && <div className="err">{err}</div>}
            <button className="btn block" style={{ marginTop: 12 }} disabled={busy} onClick={send}>
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
