import { useState } from 'react'
import SimpleModal from './SimpleModal.jsx'

// Excel-style Find & Replace across the current sheet.
export default function FindReplace({ cols, rows, onReplaceAll, onFindNext, onClose }) {
  const [find, setFind] = useState('')
  const [repl, setRepl] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [msg, setMsg] = useState('')

  const count = () => {
    if (!find) return 0
    let n = 0
    const f = matchCase ? find : find.toLowerCase()
    rows.forEach(r => cols.forEach(c => {
      let v = r.data?.[c.key]; if (v == null) return
      v = String(v); if (!matchCase) v = v.toLowerCase()
      if (v.includes(f)) n++
    }))
    return n
  }

  return (
    <SimpleModal title="Find & Replace" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input className="fr-in" placeholder="Find what…" value={find} autoFocus
          onChange={e => { setFind(e.target.value); setMsg('') }} />
        <input className="fr-in" placeholder="Replace with…" value={repl}
          onChange={e => setRepl(e.target.value)} />
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', color: '#3a3f4b' }}>
          <input type="checkbox" checked={matchCase} onChange={e => setMatchCase(e.target.checked)} /> Match case
        </label>
        <div style={{ fontSize: 12.5, color: '#69707d' }}>{find ? `${count()} match(es) found` : 'Type something to find.'}</div>
        {msg && <div style={{ fontSize: 12.5, color: '#2f5bd6', fontWeight: 600 }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 4 }}>
          <button className="btn ghost" onClick={() => { const ok = onFindNext(find, matchCase); setMsg(ok ? 'Jumped to next match' : 'No match found') }}>Find next</button>
          <button className="btn" onClick={async () => { const n = await onReplaceAll(find, repl, matchCase); setMsg(`Replaced ${n} cell(s)`) }}>Replace all</button>
        </div>
      </div>
    </SimpleModal>
  )
}
