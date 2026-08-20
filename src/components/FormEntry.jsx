import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Renders a data-entry form generated from a sheet's columns. On submit it inserts
// a new row (with an automatic timestamp) that shows up in the table.
export default function FormEntry({ sheet, cols, onSubmitted }) {
  const [vals, setVals] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const set = (key, v) => setVals(s => ({ ...s, [key]: v }))

  function field(c) {
    const v = vals[c.key]
    if (c.type === 'checkbox') {
      return <input type="checkbox" checked={!!v} onChange={e => set(c.key, e.target.checked)} />
    }
    if (c.type === 'date') {
      return <input type="date" value={v || ''} onChange={e => set(c.key, e.target.value)} />
    }
    if (c.type === 'select' || (c.options && c.options.length)) {
      return (
        <div className="fe2-inrow">
          <select value={v || ''} onChange={e => set(c.key, e.target.value)}>
            <option value="">Select…</option>
            {(c.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )
    }
    if (c.type === 'number' || c.type === 'currency' || c.type === 'percent') {
      return (
        <div className="fe2-inrow">
          <input type="number" value={v || ''} onChange={e => set(c.key, e.target.value)}
            placeholder={c.type === 'currency' ? '₹ amount' : c.type === 'percent' ? '%' : 'number'} />
        </div>
      )
    }
    return (
      <div className="fe2-inrow">
        <input type="text" value={v || ''} onChange={e => set(c.key, e.target.value)} />
      </div>
    )
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg('')
    const data = {}
    cols.forEach(c => { const v = vals[c.key]; if (v != null && v !== '') data[c.key] = v })
    const { error } = await supabase.from('rows').insert({ sheet_id: sheet.id, data, source_system: 'form' })
    setBusy(false)
    if (error) { setMsg('Error: ' + error.message); return }
    setMsg('✓ Submitted — your entry has been added to the table.')
    setVals({})
    onSubmitted && onSubmitted()
    // let the success note fade
    setTimeout(() => setMsg(''), 4000)
  }

  return (
    <div className="fe2-bg">
      <form className="fe2-card" onSubmit={submit}>
        <h2 className="fe2-title">{sheet.name}</h2>
        <p className="fe2-note">Fill in the details below and click <b>Submit entry</b>. Your entry is saved to the table with the date &amp; time.</p>
        {cols.map(c => (
          <div className="fe2-field" key={c.key}>
            <label>{c.label}</label>
            {field(c)}
          </div>
        ))}
        {msg && <div className={'fe2-msg' + (msg.startsWith('Error') ? ' err' : '')}>{msg}</div>}
        <div className="fe2-actions">
          <button className="btn" disabled={busy}>{busy ? 'Submitting…' : 'Submit entry'}</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => { setVals({}); setMsg('') }}>Clear</button>
        </div>
      </form>
    </div>
  )
}
