import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Module-level bridge to the currently-open in-cell formula editor. The grid
// (App.jsx) reads this to insert cell references on click while a formula is
// being typed. Using a shared module object (instead of a prop passed through
// AG Grid) guarantees App and the editor share the exact same reference.
export const formulaBridge = { current: null }

// Excel-style function list (name + short help) — shared with the formula bar.
export const FN_LIST = [
  ['SUM', 'Add up numbers / a range'],
  ['SUMIF', 'Add cells that match a condition'],
  ['AVERAGE', 'Average of numbers'],
  ['AVG', 'Average of numbers'],
  ['AVERAGEIF', 'Average of cells matching a condition'],
  ['MEDIAN', 'Middle value'],
  ['MIN', 'Smallest number'],
  ['MAX', 'Largest number'],
  ['COUNT', 'Count numbers'],
  ['COUNTA', 'Count non-empty cells'],
  ['COUNTIF', 'Count cells that match a condition'],
  ['PRODUCT', 'Multiply numbers'],
  ['ROUND', 'Round to N decimals'],
  ['ROUNDUP', 'Round up'],
  ['ROUNDDOWN', 'Round down'],
  ['INT', 'Integer part'],
  ['ABS', 'Absolute value'],
  ['SQRT', 'Square root'],
  ['POWER', 'x to the power y'],
  ['MOD', 'Remainder'],
  ['IF', 'If condition then A else B'],
  ['IFERROR', 'Value, or fallback on error'],
  ['AND', 'True if all are true'],
  ['OR', 'True if any is true'],
  ['NOT', 'Invert true/false'],
  ['CONCAT', 'Join text together'],
  ['CONCATENATE', 'Join text together'],
  ['LEN', 'Length of text'],
  ['LEFT', 'Left N characters'],
  ['RIGHT', 'Right N characters'],
  ['MID', 'Middle characters'],
  ['UPPER', 'UPPERCASE text'],
  ['LOWER', 'lowercase text'],
  ['TRIM', 'Remove extra spaces'],
  ['LOOKUP', 'Look up a value in a row/column'],
  ['VLOOKUP', 'Look up down a table by first column'],
  ['HLOOKUP', 'Look up across a table by first row'],
  ['INDEX', 'Value at row/col in a range'],
  ['MATCH', 'Position of a value in a range'],
  ['XLOOKUP', 'Modern lookup: find & return from another range'],
  ['CHOOSE', 'Pick the Nth value from a list'],
  ['COLUMNS', 'Number of columns in a range'],
  ['ROWS', 'Number of rows in a range'],
  // math & trig
  ['SUMPRODUCT', 'Multiply ranges then add up'],
  ['SUMSQ', 'Sum of squares'],
  ['CEILING', 'Round up to a multiple'],
  ['FLOOR', 'Round down to a multiple'],
  ['MROUND', 'Round to nearest multiple'],
  ['TRUNC', 'Cut off decimals (no rounding)'],
  ['SIGN', 'Sign of a number (-1, 0, 1)'],
  ['EXP', 'e raised to a power'],
  ['LN', 'Natural logarithm'],
  ['LOG', 'Logarithm to a base'],
  ['LOG10', 'Base-10 logarithm'],
  ['PI', 'The value of π'],
  ['RAND', 'Random number 0–1'],
  ['RANDBETWEEN', 'Random whole number in a range'],
  ['FACT', 'Factorial'],
  ['COMBIN', 'Combinations (n choose k)'],
  ['PERMUT', 'Permutations'],
  ['QUOTIENT', 'Integer part of a division'],
  ['GCD', 'Greatest common divisor'],
  ['LCM', 'Least common multiple'],
  ['EVEN', 'Round up to even number'],
  ['ODD', 'Round up to odd number'],
  ['SIN', 'Sine'],
  ['COS', 'Cosine'],
  ['TAN', 'Tangent'],
  ['ASIN', 'Arcsine'],
  ['ACOS', 'Arccosine'],
  ['ATAN', 'Arctangent'],
  ['ATAN2', 'Arctangent from x,y'],
  ['SINH', 'Hyperbolic sine'],
  ['COSH', 'Hyperbolic cosine'],
  ['TANH', 'Hyperbolic tangent'],
  ['DEGREES', 'Radians to degrees'],
  ['RADIANS', 'Degrees to radians'],
  // statistical
  ['COUNTBLANK', 'Count empty cells'],
  ['COUNTIFS', 'Count with multiple conditions'],
  ['SUMIFS', 'Sum with multiple conditions'],
  ['AVERAGEIFS', 'Average with multiple conditions'],
  ['MAXIFS', 'Max with multiple conditions'],
  ['MINIFS', 'Min with multiple conditions'],
  ['LARGE', 'Nth largest value'],
  ['SMALL', 'Nth smallest value'],
  ['RANK', 'Rank of a value in a list'],
  ['STDEV', 'Standard deviation (sample)'],
  ['STDEVP', 'Standard deviation (population)'],
  ['VAR', 'Variance (sample)'],
  ['VARP', 'Variance (population)'],
  ['MODE', 'Most frequent value'],
  ['GEOMEAN', 'Geometric mean'],
  ['HARMEAN', 'Harmonic mean'],
  ['PERCENTILE', 'Kth percentile of a range'],
  ['QUARTILE', 'Quartile of a range (0–4)'],
  ['AVERAGEA', 'Average incl. text as 0'],
  // text
  ['FIND', 'Position of text (case-sensitive)'],
  ['SEARCH', 'Position of text (case-insensitive)'],
  ['REPLACE', 'Replace text by position'],
  ['SUBSTITUTE', 'Replace matching text'],
  ['REPT', 'Repeat text N times'],
  ['TEXTJOIN', 'Join text with a delimiter'],
  ['PROPER', 'Capitalise Each Word'],
  ['VALUE', 'Convert text to a number'],
  ['NUMBERVALUE', 'Convert text to a number'],
  ['CHAR', 'Character from a code'],
  ['CODE', 'Code of the first character'],
  ['EXACT', 'Exact text comparison'],
  ['CLEAN', 'Remove non-printable characters'],
  ['TEXT', 'Format a number as text'],
  // logical
  ['IFS', 'Multiple if conditions'],
  ['SWITCH', 'Match a value to a result'],
  ['XOR', 'Exclusive OR'],
  ['IFNA', 'Value, or fallback on #N/A'],
  ['TRUE', 'The value TRUE'],
  ['FALSE', 'The value FALSE'],
  // date & time
  ['TODAY', "Today's date"],
  ['NOW', 'Current date & time'],
  ['DATE', 'Build a date from year, month, day'],
  ['YEAR', 'Year of a date'],
  ['MONTH', 'Month of a date'],
  ['DAY', 'Day of a date'],
  ['HOUR', 'Hour of a time'],
  ['MINUTE', 'Minute of a time'],
  ['SECOND', 'Second of a time'],
  ['WEEKDAY', 'Day of week number'],
  ['DAYS', 'Days between two dates'],
  ['EDATE', 'Date N months away'],
  ['EOMONTH', 'End of month, N months away'],
  // information
  ['ISNUMBER', 'Is the value a number?'],
  ['ISTEXT', 'Is the value text?'],
  ['ISBLANK', 'Is the cell empty?'],
  ['ISERROR', 'Is the value an error?'],
  ['ISERR', 'Is it an error (not #N/A)?'],
  ['ISNA', 'Is the value #N/A?'],
  ['ISLOGICAL', 'Is the value TRUE/FALSE?'],
  ['ISEVEN', 'Is the number even?'],
  ['ISODD', 'Is the number odd?'],
  ['N', 'Convert value to a number'],
  ['NA', 'The #N/A error value'],
]

// Inline AG Grid cell editor. Type into any cell; when the value starts with
// "=", an Excel-style function dropdown appears (rendered in a body portal so it
// never gets clipped). ↑/↓ pick, Enter/Tab insert; Enter (no dropdown) applies
// and the computed result shows in the same cell.
const FormulaEditor = forwardRef((props, ref) => {
  const startChar = props.eventKey && props.eventKey.length === 1 ? props.eventKey : null
  const initial = startChar != null ? startChar : (props.value == null ? '' : String(props.value))
  const [value, setValue] = useState(initial)
  const [ac, setAc] = useState(null)          // { items, active }
  const [pos, setPos] = useState(null)        // { left, top, width } for the portal dropdown
  const inputRef = useRef(null)
  const valueRef = useRef(value); valueRef.current = value

  // AG Grid v32 uses reactiveCustomComponents by default: the editor must push
  // its value up via props.onValueChange (the legacy getValue below is ignored
  // in that mode). Propagate every change so edits actually commit.
  useEffect(() => { if (props.onValueChange) props.onValueChange(value) }, [value])

  // getValue: what AG Grid stores. focusIn: AG Grid calls this to move focus into
  // the editor synchronously when editing starts — so keystrokes never get lost.
  useImperativeHandle(ref, () => ({
    getValue: () => valueRef.current,
    focusIn: () => {
      const el = inputRef.current; if (!el) return
      el.focus()
      const n = el.value.length; try { el.setSelectionRange(n, n) } catch { /* noop */ }
      updateAc(el.value, el.value.length)
    },
  }))

  function computePos() {
    const el = inputRef.current; if (!el) return null
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.bottom + 2, width: Math.max(280, r.width) }
  }

  function updateAc(v, caret) {
    if (!(v || '').trim().startsWith('=')) { setAc(null); return }
    const before = v.slice(0, caret == null ? v.length : caret)
    const m = /([A-Za-z]+)$/.exec(before)
    if (!m) { setAc(null); return }
    const token = m[1].toUpperCase()
    const items = FN_LIST.filter(f => f[0].startsWith(token)).slice(0, 8)
    if (items.length) { setPos(computePos()); setAc({ items, active: 0 }) }
    else setAc(null)
  }

  useEffect(() => {
    const t = setTimeout(() => {
      const el = inputRef.current; if (!el) return
      el.focus()
      const n = el.value.length; try { el.setSelectionRange(n, n) } catch { /* noop */ }
      if (startChar == null) el.select?.()
      updateAc(el.value, el.value.length)
    }, 0)
    // register bridges so the grid can insert cell references on click.
    const reg = { isArmed: () => (valueRef.current || '').trim().startsWith('='), insertRef }
    formulaBridge.current = reg
    const b = props.bridge
    if (b) b.current = reg
    return () => {
      clearTimeout(t)
      if (formulaBridge.current === reg) formulaBridge.current = null
      if (props.bridge && props.bridge.current === reg) props.bridge.current = null
    }
  }, []) // eslint-disable-line

  function insertRef(refStr) {
    const el = inputRef.current
    const caret = el ? el.selectionStart : valueRef.current.length
    const v = valueRef.current
    const nv = v.slice(0, caret) + refStr + v.slice(caret)
    setValue(nv)
    const p = caret + refStr.length
    requestAnimationFrame(() => { if (el) { el.focus(); try { el.setSelectionRange(p, p) } catch { /* noop */ } } })
  }

  function accept(name) {
    const el = inputRef.current
    const caret = el ? el.selectionStart : value.length
    const before = value.slice(0, caret).replace(/([A-Za-z]+)$/, name + '(')
    const after = value.slice(caret)
    const nv = before + after
    setValue(nv); setAc(null)
    requestAnimationFrame(() => { if (el) { el.focus(); const p = before.length; try { el.setSelectionRange(p, p) } catch { /* noop */ } } })
  }

  function onKeyDown(e) {
    if (ac) {
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setAc(a => ({ ...a, active: (a.active + 1) % a.items.length })); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setAc(a => ({ ...a, active: (a.active - 1 + a.items.length) % a.items.length })); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); accept(ac.items[ac.active][0]); return }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAc(null); return }
    }
    // otherwise let Enter/Escape bubble so AG Grid commits / cancels
  }

  return (
    <div className="fe-inline">
      <input ref={inputRef} className="fe-input2" value={value} autoFocus
        onChange={e => { setValue(e.target.value); updateAc(e.target.value, e.target.selectionStart) }}
        onKeyDown={onKeyDown}
        onKeyUp={e => { if (!['Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) updateAc(e.target.value, e.target.selectionStart) }} />
      {ac && pos && createPortal(
        <div className="fe-ac" style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width, zIndex: 9999 }}>
          <div className="fe-ac-head">Functions — ↑↓ pick · Tab/Enter insert</div>
          {ac.items.map((f, i) => (
            <button key={f[0]} className={'fe-ac-item' + (i === ac.active ? ' on' : '')}
              onMouseDown={e => { e.preventDefault(); accept(f[0]) }}>
              <b>{f[0]}</b><span>{f[1]}</span>
            </button>
          ))}
        </div>, document.body)}
    </div>
  )
})

export default FormulaEditor
