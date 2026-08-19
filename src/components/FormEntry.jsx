import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Browser speech-to-text (Chrome/Edge). null if unsupported.
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

// Renders a data-entry form generated from a sheet's columns. Each text/number/
// dropdown field has a 🎤 button — click it and speak to fill the field. On submit
// it inserts a new row (with an automatic timestamp) that shows up in the table.
export default function FormEntry({ sheet, cols, onSubmitted }) {
  const [vals, setVals] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [listening, setListening] = useState(null)   // key of the field currently listening
  const recRef = useRef(null)

  const set = (key, v) => setVals(s => ({ ...s, [key]: v }))

  // Start voice capture for one field. Speech is converted to text and placed in
  // that field. For number fields we keep just the digits; for dropdowns we match
  // the spoken words to an option.
  function speak(c) {
    if (!SR) { setMsg('Voice input needs Chrome or Edge on this device.'); setTimeout(() => setMsg(''), 4000); return }
    if (listening) { try { recRef.current && recRef.current.stop() } catch { /* noop */ } return }
    const rec = new SR()
    recRef.current = rec
    rec.lang = 'en-IN'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      const said = (e.results[0][0].transcript || '').trim()
      if (!said) return
      if (c.type === 'number' || c.type === 'currency' || c.type === 'percent') {
        const digits = said.replace(/[^0-9.]/g, '')
        set(c.key, digits || said)
      } else if (c.type === 'select' || (c.options && c.options.length)) {
        const opt = (c.options || []).find(o => o.toLowerCase() === said.toLowerCase())
          || (c.options || []).find(o => o.toLowerCase().includes(said.toLowerCase()))
        set(c.key, opt || said)
      } else {
        // append to any existing text so you can dictate in parts
        set(c.key, prevJoin(vals[c.key], said))
      }
    }
    rec.onerror = (e) => { setListening(null); if (e.error === 'not-allowed') { setMsg('Please allow microphone access to use voice input.'); setTimeout(() => setMsg(''), 4000) } }
    rec.onend = () => setListening(null)
    try { rec.start(); setListening(c.key) } catch { setListening(null) }
  }
  function prevJoin(prev, said) { return prev ? (String(prev).trim() + ' ' + said) : said }

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
          {mic(c)}
        </div>
      )
    }
    if (c.type === 'number' || c.type === 'currency' || c.type === 'percent') {
      return (
        <div className="fe2-inrow">
          <input type="number" value={v || ''} onChange={e => set(c.key, e.target.value)}
            placeholder={c.type === 'currency' ? '₹ amount' : c.type === 'percent' ? '%' : 'number'} />
          {mic(c)}
        </div>
      )
    }
    return (
      <div className="fe2-inrow">
        <input type="text" value={v || ''} onChange={e => set(c.key, e.target.value)} />
        {mic(c)}
      </div>
    )
  }

  function mic(c) {
    const on = listening === c.key
    return (
      <button type="button" className={'fe2-mic' + (on ? ' on' : '')} title={on ? 'Listening… click to stop' : 'Speak to fill'}
        onClick={() => speak(c)} disabled={busy}>
        {on ? '● Listening…' : '🎤'}
      </button>
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
        <p className="fe2-note">Fill in the details below and click <b>Submit entry</b>. Tip: tap the <b>🎤</b> next to a field and speak to fill it. Your entry is saved to the table with the date &amp; time.</p>
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
