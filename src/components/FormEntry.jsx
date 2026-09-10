import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Renders a data-entry form generated from a sheet's columns. On submit it inserts
// a new row (with an automatic timestamp) that shows up in the table.
//
// Users also get a "Columns" drawer (👁 View) that lets them hide fields they
// don't need to see. This is a purely personal, client-side preference — it is
// stored in localStorage per sheet and never changes the sheet or anyone else's
// view. Hidden fields are simply not shown and not required on submit.
export default function FormEntry({ sheet, cols, onSubmitted }) {
  const [vals, setVals] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [drawer, setDrawer] = useState(false)      // Columns drawer open?
  const [hidden, setHidden] = useState({})         // { [colKey]: true } = hidden

  const lsKey = sheet ? 'fe_hidden_' + sheet.id : null

  // Load this user's saved show/hide choices for this sheet.
  useEffect(() => {
    if (!lsKey) return
    try {
      const raw = localStorage.getItem(lsKey)
      setHidden(raw ? JSON.parse(raw) : {})
    } catch { setHidden({}) }
  }, [lsKey])

  const saveHidden = (next) => {
    setHidden(next)
    try { if (lsKey) localStorage.setItem(lsKey, JSON.stringify(next)) } catch {}
  }
  const toggleCol = (key) => saveHidden({ ...hidden, [key]: !hidden[key] })
  const showAll = () => saveHidden({})

  // Only the columns the user has chosen to keep visible are rendered / required.
  const shownCols = useMemo(() => cols.filter(c => !hidden[c.key]), [cols, hidden])
  const hiddenCount = cols.length - shownCols.length

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
    const data = {}
    const missing = []   // required fields left blank
    const badNum = []    // numeric fields with a non-number value
    // Only the visible fields are collected and required — hidden ones are skipped.
    shownCols.forEach(c => {
      // Checkboxes always have a valid value (checked/unchecked).
      if (c.type === 'checkbox') { data[c.key] = !!vals[c.key]; return }
      let v = vals[c.key]
      if (typeof v === 'string') v = v.trim()
      if (v == null || v === '') { missing.push(c.label); return }
      if ((c.type === 'number' || c.type === 'currency' || c.type === 'percent') && isNaN(parseFloat(v))) {
        badNum.push(c.label)
      }
      data[c.key] = v
    })
    // Every visible field must be filled...
    if (missing.length) {
      setMsg('Error: Please fill all fields. Missing: ' + missing.join(', '))
      setTimeout(() => setMsg(''), 6000)
      return
    }
    // ...and numeric fields must contain a valid number.
    if (badNum.length) {
      setMsg('Error: These fields need a valid number: ' + badNum.join(', '))
      setTimeout(() => setMsg(''), 6000)
      return
    }
    setBusy(true); setMsg('')
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
        <div className="fe2-head">
          <h2 className="fe2-title">{sheet.name}</h2>
          <button type="button" className="fe2-cols-btn" onClick={() => setDrawer(true)}>
            👁 Columns{hiddenCount ? <span className="fe2-cols-badge">{hiddenCount} hidden</span> : null}
          </button>
        </div>
        <p className="fe2-note">Fill in <b>all</b> the fields below, then click <b>Submit entry</b>. Your entry is saved to the table with the date &amp; time.</p>
        {shownCols.map(c => (
          <div className="fe2-field" key={c.key}>
            <label>{c.label}</label>
            {field(c)}
          </div>
        ))}
        {shownCols.length === 0 && (
          <div className="fe2-empty">All fields are hidden. Open <b>👁 Columns</b> and turn some back on to add an entry.</div>
        )}
        {msg && <div className={'fe2-msg' + (msg.startsWith('Error') ? ' err' : '')}>{msg}</div>}
        <div className="fe2-actions">
          <button className="btn" disabled={busy || shownCols.length === 0}>{busy ? 'Submitting…' : 'Submit entry'}</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => { setVals({}); setMsg('') }}>Clear</button>
        </div>
      </form>

      {drawer && (
        <div className="fe2-cols-ov" onClick={() => setDrawer(false)}>
          <div className="fe2-cols-drawer" onClick={e => e.stopPropagation()}>
            <div className="fe2-cols-dhead">
              <div>
                <div className="fe2-cols-dtitle">👁 Show / hide fields</div>
                <div className="fe2-cols-dsub">Pick which fields you want to see. This is just for you — it doesn’t change the sheet.</div>
              </div>
              <button type="button" className="fe2-cols-x" onClick={() => setDrawer(false)}>✕</button>
            </div>
            <div className="fe2-cols-list">
              {cols.map(c => {
                const on = !hidden[c.key]
                return (
                  <label key={c.key} className={'fe2-cols-item' + (on ? '' : ' off')}>
                    <span className="fe2-cols-name">{c.label}</span>
                    <span className={'fe2-cols-sw' + (on ? ' on' : '')} onClick={() => toggleCol(c.key)}>
                      <span className="fe2-cols-knob" />
                    </span>
                  </label>
                )
              })}
            </div>
            <div className="fe2-cols-dfoot">
              <button type="button" className="btn ghost" onClick={showAll}>Show all</button>
              <button type="button" className="btn" onClick={() => setDrawer(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
