import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Per-row conversation: comments + file attachments (image / PDF / any file).
// Files go to the public "attachments" storage bucket; the row_comments row
// stores the comment text and/or the attachment link.
function timeAgo(ts) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000
  if (d < 60) return 'just now'
  if (d < 3600) return Math.floor(d / 60) + ' min ago'
  if (d < 86400) return Math.floor(d / 3600) + ' hr ago'
  return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const isImg = (name = '') => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)

export default function RowComments({ sheet, row, profile, rowTitle, onClose, onCountChange }) {
  const [items, setItems] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [file, setFile] = useState(null)
  const fileRef = useRef(null)

  async function load() {
    setErr('')
    const { data, error } = await supabase.from('row_comments')
      .select('*').eq('row_id', row.id).order('created_at', { ascending: true })
    if (error) { setErr(error.message.includes('does not exist') ? 'setup' : error.message); setItems([]); return }
    setItems(data || [])
    onCountChange && onCountChange(row.id, (data || []).length)
  }
  useEffect(() => { load() }, [row.id])

  async function send(e) {
    e?.preventDefault?.()
    if (!text.trim() && !file) return
    setBusy(true); setErr('')
    let attachment_url = null, attachment_name = null
    try {
      if (file) {
        const path = `${sheet.id}/${row.id}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`
        const up = await supabase.storage.from('attachments').upload(path, file, { upsert: false })
        if (up.error) throw up.error
        const { data: pub } = supabase.storage.from('attachments').getPublicUrl(path)
        attachment_url = pub.publicUrl; attachment_name = file.name
      }
      const rec = {
        sheet_id: sheet.id, row_id: row.id,
        user_id: profile.id, user_email: profile.email || null,
        user_name: profile.full_name || profile.name || null,
        body: text.trim() || null, attachment_url, attachment_name,
      }
      const { error } = await supabase.from('row_comments').insert(rec)
      if (error) throw error
      setText(''); setFile(null); if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (e2) {
      setErr(e2.message?.includes('does not exist') || e2.message?.includes('Bucket not found') ? 'setup' : (e2.message || 'Failed to post'))
    }
    setBusy(false)
  }

  async function del(id) {
    await supabase.from('row_comments').delete().eq('id', id)
    load()
  }

  const initials = (n) => (n || '?').trim().slice(0, 2).toUpperCase()

  return (
    <div className="rc-ov" onClick={onClose}>
      <div className="rc-drawer" onClick={e => e.stopPropagation()}>
        <div className="rc-head">
          <div>
            <div className="rc-title">💬 Comments</div>
            <div className="rc-sub">{rowTitle || 'Row'}</div>
          </div>
          <button className="rc-x" onClick={onClose}>✕</button>
        </div>

        <div className="rc-body">
          {items === null && <div className="rc-load">Loading…</div>}
          {err === 'setup' && (
            <div className="rc-setup">⚙ One-time setup needed: run the provided <b>Batch B SQL</b> in Supabase (it creates the comments table + the <b>attachments</b> storage bucket), then reopen this.</div>
          )}
          {items && items.length === 0 && err !== 'setup' && <div className="rc-empty">No comments yet. Start the conversation below — you can attach a photo, PDF or any file.</div>}
          {items && items.map(c => (
            <div className="rc-item" key={c.id}>
              <div className="rc-av">{initials(c.user_name || c.user_email)}</div>
              <div className="rc-main">
                <div className="rc-who"><b>{c.user_name || c.user_email || 'Someone'}</b> <span className="rc-time">{timeAgo(c.created_at)}</span></div>
                {c.body && <div className="rc-text">{c.body}</div>}
                {c.attachment_url && (
                  isImg(c.attachment_name)
                    ? <a href={c.attachment_url} target="_blank" rel="noreferrer"><img className="rc-img" src={c.attachment_url} alt={c.attachment_name} /></a>
                    : <a className="rc-file" href={c.attachment_url} target="_blank" rel="noreferrer">📎 {c.attachment_name}</a>
                )}
                {(c.user_id === profile.id) && <button className="rc-del" onClick={() => del(c.id)}>Delete</button>}
              </div>
            </div>
          ))}
        </div>

        <form className="rc-foot" onSubmit={send}>
          {file && <div className="rc-chip">📎 {file.name} <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}>✕</button></div>}
          {err && err !== 'setup' && <div className="rc-err">{err}</div>}
          <div className="rc-inrow">
            <button type="button" className="rc-attach" title="Attach a file" onClick={() => fileRef.current?.click()}>📎</button>
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
            <input className="rc-input" placeholder="Write a comment…" value={text} onChange={e => setText(e.target.value)} />
            <button className="btn" disabled={busy || (!text.trim() && !file)}>{busy ? '…' : 'Send'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
