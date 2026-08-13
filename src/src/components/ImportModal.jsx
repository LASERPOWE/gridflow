import { useState } from 'react'
import { listSheets, getSheet, transform } from '../lib/smartsheet'
import { supabase } from '../lib/supabase'

/**
 * Smartsheet import:
 *  1. paste API token → list sheets
 *  2. pick a sheet → pull columns + rows
 *  3. create a sheet in our DB (under given workspace) + columns + rows
 */
export default function ImportModal({ workspaceId, onClose, onDone }) {
  const [token, setToken] = useState(localStorage.getItem('ss_token') || '')
  const [sheets, setSheets] = useState([])
  const [step, setStep] = useState('token')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [progress, setProgress] = useState('')

  async function connect() {
    setBusy(true); setErr('')
    try {
      const list = await listSheets(token.trim())
      localStorage.setItem('ss_token', token.trim())
      setSheets(list); setStep('pick')
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  async function importSheet(ss) {
    setBusy(true); setErr(''); setProgress('Fetching from Smartsheet…')
    try {
      const payload = await getSheet(token.trim(), ss.id)
      const { name, columns, rows } = transform(payload)

      // 1. create sheet in our DB
      setProgress('Creating sheet…')
      const { data: sheet, error: se } = await supabase
        .from('sheets').insert({ workspace_id: workspaceId, name: name || ss.name, kind: 'grid' })
        .select().single()
      if (se) throw new Error(se.message)

      // 2. columns
      setProgress('Creating columns…')
      if (columns.length) {
        const { error: ce } = await supabase.from('sheet_columns')
          .insert(columns.map(c => ({ ...c, sheet_id: sheet.id })))
        if (ce) throw new Error(ce.message)
      }

      // 3. rows in batches
      const CHUNK = 200
      for (let i = 0; i < rows.length; i += CHUNK) {
        setProgress(`Importing rows ${i + 1}–${Math.min(i + CHUNK, rows.length)} of ${rows.length}…`)
        const batch = rows.slice(i, i + CHUNK).map(r => ({ ...r, sheet_id: sheet.id }))
        const { error: re } = await supabase.from('rows').insert(batch)
        if (re) throw new Error(re.message)
      }
      setProgress('Done!')
      onDone(sheet)
    } catch (e) { setErr(e.message); setBusy(false); setProgress('') }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header><h3>Import from Smartsheet</h3><button className="x" onClick={onClose}>&times;</button></header>
        <div className="body">
          {step === 'token' && (
            <>
              <div className="steps" style={{ marginBottom: 12 }}>
                <b>How to get your token:</b><br/>
                In Smartsheet → your avatar → <code>Personal Settings</code> → <code>API Access</code> →
                <code>Generate new access token</code>. Paste it below. It stays only in your browser.
              </div>
              <label>Smartsheet API token</label>
              <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="paste token…" />
              {err && <div className="err">{err}</div>}
            </>
          )}
          {step === 'pick' && (
            <>
              <p className="count" style={{ marginBottom: 10 }}>{sheets.length} sheet(s) found. Pick one to import:</p>
              {sheets.length === 0 && <div className="empty">No sheets in this Smartsheet account.</div>}
              {sheets.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid var(--border)' }}>
                  <span>▤ {s.name}</span>
                  <button className="btn sm" disabled={busy} onClick={() => importSheet(s)}>Import</button>
                </div>
              ))}
              {progress && <div className="notice" style={{ marginTop: 12 }}>{progress}</div>}
              {err && <div className="err">{err}</div>}
            </>
          )}
        </div>
        <footer>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          {step === 'token' && <button className="btn" disabled={busy || !token} onClick={connect}>{busy ? 'Connecting…' : 'Connect'}</button>}
        </footer>
      </div>
    </div>
  )
}
