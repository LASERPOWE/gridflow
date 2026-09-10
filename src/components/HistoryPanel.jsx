import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'

// Admin-only audit trail for a sheet: who changed what and when, with a
// "Restore" button on deleted rows that re-inserts them from the snapshot.
function timeAgo(ts) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000
  if (d < 60) return 'just now'
  if (d < 3600) return Math.floor(d / 60) + ' min ago'
  if (d < 86400) return Math.floor(d / 3600) + ' hr ago'
  return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const ACTION_META = {
  edit:        { icon: '✏️', label: 'edited' },
  delete_row:  { icon: '🗑', label: 'deleted a row' },
  restore_row: { icon: '↩️', label: 'restored a row' },
  add_row:     { icon: '➕', label: 'added a row' },
}

export default function HistoryPanel({ sheet, profile, onClose, onRestored }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [restoring, setRestoring] = useState(null)

  async function load() {
    setErr('')
    const { data, error } = await supabase.from('activity_log')
      .select('*').eq('sheet_id', sheet.id).order('created_at', { ascending: false }).limit(200)
    if (error) { setErr(error.message.includes('does not exist') ? 'setup' : error.message); setRows([]); return }
    setRows(data || [])
  }
  useEffect(() => { load() }, [sheet.id])

  async function restore(entry) {
    if (!entry.snapshot) return
    setRestoring(entry.id)
    const { data: ins, error } = await supabase.from('rows')
      .insert({ sheet_id: sheet.id, data: entry.snapshot, source_system: 'restore' }).select().single()
    setRestoring(null)
    if (error) { setErr(error.message); return }
    await logActivity(profile, { sheet_id: sheet.id, row_id: ins.id, action: 'restore_row', snapshot: entry.snapshot })
    onRestored && onRestored(ins)
    load()
  }

  return (
    <div className="hp-ov" onClick={onClose}>
      <div className="hp-drawer" onClick={e => e.stopPropagation()}>
        <div className="hp-head">
          <div>
            <div className="hp-title">🕘 Activity & history</div>
            <div className="hp-sub">{sheet.name} — who changed what, newest first</div>
          </div>
          <button className="hp-x" onClick={onClose}>✕</button>
        </div>

        <div className="hp-body">
          {rows === null && <div className="hp-load">Loading…</div>}
          {err === 'setup' && (
            <div className="hp-setup">⚙ One-time setup needed: run the provided <b>Batch B SQL</b> in Supabase → SQL Editor, then reopen this. After that, all edits and deletions will be tracked here automatically.</div>
          )}
          {err && err !== 'setup' && <div className="hp-err">{err}</div>}
          {rows && rows.length === 0 && !err && <div className="hp-empty">No activity recorded yet. Edits and deletions on this sheet will show up here.</div>}
          {rows && rows.map(e => {
            const m = ACTION_META[e.action] || { icon: '•', label: e.action }
            const who = e.user_name || e.user_email || 'Someone'
            return (
              <div className="hp-item" key={e.id}>
                <span className="hp-ic">{m.icon}</span>
                <div className="hp-main">
                  <div className="hp-line"><b>{who}</b> {m.label}{e.col_label ? <> <b>{e.col_label}</b></> : null}</div>
                  {e.action === 'edit' && (
                    <div className="hp-change">
                      <span className="hp-old">{e.old_value || '(empty)'}</span>
                      <span className="hp-arrow">→</span>
                      <span className="hp-new">{e.new_value || '(empty)'}</span>
                    </div>
                  )}
                  <div className="hp-time">{timeAgo(e.created_at)}</div>
                </div>
                {e.action === 'delete_row' && e.snapshot && (
                  <button className="hp-restore" disabled={restoring === e.id} onClick={() => restore(e)}>
                    {restoring === e.id ? '…' : '↩ Restore'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
