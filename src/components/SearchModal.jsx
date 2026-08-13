import { useEffect, useMemo, useRef, useState } from 'react'

// Smartsheet-style search overlay. Filters sheets by name; click opens.
export default function SearchModal({ open, onClose, sheets, recents, onPick }) {
  const [q, setQ] = useState('')
  const inputRef = useRef()

  useEffect(() => {
    if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 30) }
  }, [open])
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const results = useMemo(() => {
    if (!q.trim()) return []
    const t = q.toLowerCase()
    return sheets.filter(s => (s.name || '').toLowerCase().includes(t)).slice(0, 20)
  }, [q, sheets])

  if (!open) return null
  const showRecents = !q.trim()

  return (
    <div className="search-overlay" onMouseDown={onClose}>
      <div className="search-box" onMouseDown={e => e.stopPropagation()}>
        <div className="search-head">
          <span className="search-ico">🔍</span>
          <input ref={inputRef} placeholder="Search sheets…" value={q} onChange={e => setQ(e.target.value)} />
          <span className="search-esc">Esc</span>
        </div>
        <div className="search-list">
          {showRecents && (
            <>
              <div className="search-section">Recents</div>
              {(recents || []).slice(0, 8).map(s => (
                <button key={s.id} className="search-item" onClick={() => { onPick(s); onClose() }}>
                  <span className="search-item-ico">▦</span>
                  <span className="search-item-name">{s.name}</span>
                  <span className="search-item-tag">Sheet</span>
                </button>
              ))}
              {(!recents || recents.length === 0) && <div className="search-empty">No recent sheets.</div>}
            </>
          )}
          {!showRecents && results.map(s => (
            <button key={s.id} className="search-item" onClick={() => { onPick(s); onClose() }}>
              <span className="search-item-ico">▦</span>
              <span className="search-item-name">{s.name}</span>
              <span className="search-item-tag">Sheet</span>
            </button>
          ))}
          {!showRecents && results.length === 0 && <div className="search-empty">No sheets match “{q}”.</div>}
        </div>
      </div>
    </div>
  )
}
