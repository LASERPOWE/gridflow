import { useState } from 'react'
import { isFormula, evalFormula } from '../lib/formula.js'

// Phone-friendly view: each row becomes a tappable card that shows every
// field stacked vertically. Editing a field saves on blur (Enter also saves).
// Used automatically on narrow screens instead of the wide AG Grid.
export default function MobileCards({ cols, rows, canWrite, resolveCell, onSave, onAdd }) {
  const [openId, setOpenId] = useState(null)   // which card is expanded

  const display = (row, c) => {
    const raw = row.data?.[c.key]
    if (raw === '' || raw == null) return ''
    if (isFormula(raw)) { try { return String(evalFormula(raw, resolveCell)) } catch { return String(raw) } }
    return String(raw)
  }

  if (!rows.length) {
    return (
      <div className="mc-wrap">
        <div className="mc-empty">No rows yet.</div>
        {canWrite && <button className="mc-add" onClick={onAdd}>＋ Add row</button>}
      </div>
    )
  }

  return (
    <div className="mc-wrap">
      {rows.map((row, ri) => {
        const open = openId === row.id
        // headline = first non-empty field so a collapsed card is recognisable
        const head = cols.map(c => display(row, c)).find(Boolean) || `Row ${ri + 1}`
        return (
          <div key={row.id} className={'mc-card' + (open ? ' open' : '')}>
            <button className="mc-head" onClick={() => setOpenId(open ? null : row.id)}>
              <span className="mc-num">{ri + 1}</span>
              <span className="mc-title">{head}</span>
              <span className="mc-chev">{open ? '▲' : '▼'}</span>
            </button>
            {open && (
              <div className="mc-body">
                {cols.map(c => (
                  <label key={c.key} className="mc-field">
                    <span className="mc-label">{c.label}</span>
                    {c.type === 'checkbox' ? (
                      <input type="checkbox" disabled={!canWrite}
                        checked={row.data?.[c.key] === true || row.data?.[c.key] === 'true'}
                        onChange={e => onSave(row, c, e.target.checked)} />
                    ) : (c.type === 'select' && c.options?.length) ? (
                      <select className="mc-input" disabled={!canWrite}
                        defaultValue={row.data?.[c.key] ?? ''}
                        onChange={e => onSave(row, c, e.target.value)}>
                        <option value=""></option>
                        {c.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className="mc-input" type={c.type === 'date' ? 'date' : 'text'}
                        disabled={!canWrite}
                        defaultValue={display(row, c)}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        onBlur={e => {
                          const v = e.target.value
                          const cur = row.data?.[c.key]
                          if (String(cur ?? '') !== v) onSave(row, c, v)
                        }} />
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {canWrite && <button className="mc-add" onClick={onAdd}>＋ Add row</button>}
    </div>
  )
}
