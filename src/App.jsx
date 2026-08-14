import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { supabase } from './lib/supabase'
import { PillRenderer, inr } from './lib/cells.jsx'
import { isFormula, evalFormula } from './lib/formula.js'
import Login from './components/Login.jsx'
import ImportModal from './components/ImportModal.jsx'
import IconRail from './components/IconRail.jsx'
import Notifications from './components/Notifications.jsx'
import RequestAccess from './components/RequestAccess.jsx'
import Loader from './components/Loader.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import ProfileMenu from './components/ProfileMenu.jsx'
import SearchModal from './components/SearchModal.jsx'
import SimpleModal from './components/SimpleModal.jsx'
import FindReplace from './components/FindReplace.jsx'
import ShareModal from './components/ShareModal.jsx'

// smartsheet logo mark (reused)
function Mark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#fff" />
      <path d="M6 12.5l3.5 3.5L18 7.5" stroke="#2f5bd6" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// flatten all sheets from the tree
function allSheets(tree) {
  const out = []
  tree.forEach(o => o.depts.forEach(d => d.wss.forEach(w => (w.sheets || []).forEach(s => out.push(s)))))
  return out
}

// Excel-style column letters: 0->A, 25->Z, 26->AA, ...
function colLetter(n) {
  let s = ''
  n = n + 1
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s
}

// Fixed column colors (Smartsheet-style), matched by column key/label keywords.
function colorClass(key, label) {
  const s = (key + ' ' + label).toLowerCase()
  if (s.includes('docket') || s.includes('enq')) return 'col-orange'
  if (s.includes('date') || s.includes('dd-yy') || s.includes('diff')) return 'col-yellow'
  if (s.includes('marketing') || s.includes('tender') || s.includes('party') || s.includes('reason') || s.includes('project') || s.includes('utility')) return 'col-blue'
  return ''
}

// Cell-type display formatters (Excel-like).
function fmtNumber(n) { const x = parseFloat(n); return isNaN(x) ? n : x.toLocaleString('en-IN') }
function fmtCurrency(n) { const x = parseFloat(n); return isNaN(x) ? n : '₹' + x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtPercent(n) { const x = parseFloat(n); return isNaN(x) ? n : x + '%' }
function fmtDate(v) { if (v === '' || v == null) return v; const d = new Date(v); return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
const isChecked = (v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'TRUE'

// Formula functions for the autocomplete dropdown (name + short help).
const FN_LIST = [
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
]

function Workspace() {
  const { profile, role, signOut, canWrite, isApprover, isApprover: isAdmin } = useAuth()
  const [tree, setTree] = useState([])
  const [firstWsId, setFirstWsId] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [cols, setCols] = useState([])
  const [rows, setRows] = useState([])
  const [quick, setQuick] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [view, setView] = useState('browse')
  const [showNotif, setShowNotif] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [showReq, setShowReq] = useState(false)
  const [busy, setBusy] = useState(true)      // loader overlay (app start + transitions)
  const [busyLabel, setBusyLabel] = useState('')
  const [showProfile, setShowProfile] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [soon, setSoon] = useState('')        // coming-soon modal label
  const [confirmDel, setConfirmDel] = useState(null)  // sheet pending delete
  const [recents, setRecents] = useState([])  // recently opened sheets
  const [frozen, setFrozen] = useState(false) // freeze first data column
  const [fx, setFx] = useState({ label: '', value: '', rowId: null, key: null }) // formula bar
  const [menu, setMenu] = useState(null)      // toolbar dropdown: 'insert' | 'delete' | 'format' | null
  const [showFR, setShowFR] = useState(false) // find & replace
  const [selectDlg, setSelectDlg] = useState(null) // dropdown-options dialog for a column
  const [treeCollapsed, setTreeCollapsed] = useState(false) // hide sheets sidebar for full-view
  const [nameDlg, setNameDlg] = useState(null) // new-sheet / rename dialog { mode, value, sheet? }
  const [showShare, setShowShare] = useState(false) // share-sheet dialog
  const [fnAc, setFnAc] = useState(null)      // formula autocomplete: { items:[[name,desc]], active }
  const gridRef = useRef()
  const fxInputRef = useRef(null)     // formula bar <input>
  const fxArmedRef = useRef(false)    // true while building a formula (click cells to insert refs)
  const fxCursorRef = useRef(0)       // last caret position in the formula bar
  const undoRef = useRef([])          // stack of {rowId, colId, old}
  const undoingRef = useRef(false)
  const sheetRef = useRef(null); sheetRef.current = sheet

  // Live refs so formulas always read the latest cell values.
  const rowsRef = useRef(rows); rowsRef.current = rows
  const colsRef = useRef(cols); colsRef.current = cols
  // resolve(colIdx,rowIdx) -> raw value of that cell (0-based, over the data columns).
  const resolveCell = useCallback((c, r) => {
    const rr = rowsRef.current[r]; const cc = colsRef.current[c]
    if (!rr || !cc) return ''
    return rr.data?.[cc.key] ?? ''
  }, [])

  const initials = (profile?.full_name || profile?.email || 'U').trim().slice(0, 2).toUpperCase()
  const openSearch = () => setShowSearch(true)

  // Briefly show the loader (min duration so the animation reads as intentional).
  function flash(label, ms = 650) {
    setBusyLabel(label || ''); setBusy(true)
    window.clearTimeout(flash._t)
    flash._t = window.setTimeout(() => setBusy(false), ms)
  }
  // Views that don't have a real screen yet -> coming-soon modal.
  const COMING_SOON = { resource: 'Resource Management', workapps: 'WorkApps', apps: 'Apps', help: 'Help' }
  function changeView(v) {
    if (v === 'search') { openSearch(); return }
    if (COMING_SOON[v]) { setSoon(COMING_SOON[v]); return }
    if (v === view) return
    flash(v.charAt(0).toUpperCase() + v.slice(1))
    setView(v)
  }

  async function loadTree(selectId) {
    const [o, d, w, s] = await Promise.all([
      supabase.from('organisations').select('*').order('name'),
      supabase.from('departments').select('*').order('name'),
      supabase.from('workspaces').select('*').order('name'),
      supabase.from('sheets').select('*').order('name'),
    ])
    const O = o.data || [], D = d.data || [], W = w.data || [], S = s.data || []
    setFirstWsId(W[0]?.id || null)
    setTree(O.map(x => ({ ...x, depts: D.filter(y => y.org_id === x.id).map(y => ({
      ...y, wss: W.filter(z => z.dept_id === y.id).map(z => ({ ...z, sheets: S.filter(sh => sh.workspace_id === z.id) })),
    })) })))
    const target = selectId ? S.find(x => x.id === selectId) : (sheet ? S.find(x => x.id === sheet.id) : S[0])
    if (target) selectSheet(target)
  }
  useEffect(() => { loadTree().finally(() => window.setTimeout(() => setBusy(false), 500)) }, []) // eslint-disable-line

  async function selectSheet(s) {
    const switching = !sheet || sheet.id !== s.id
    if (switching) { setBusyLabel(s.name); setBusy(true) }
    setSheet(s); setLoading(true); setErr('')
    const { data: c } = await supabase.from('sheet_columns').select('*').eq('sheet_id', s.id).order('position')
    setCols(c || [])
    // Stable row order: created_at, then id as tie-breaker so rows never "jump"
    // between reloads (blank sheets insert many rows with the same created_at).
    const { data: r, error } = await supabase.from('rows').select('*').eq('sheet_id', s.id)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(20000)
    if (error) setErr(error.message)
    setRows(r || []); setLoading(false)
    setRecents(prev => [s, ...prev.filter(x => x.id !== s.id)].slice(0, 8))
    if (switching) window.setTimeout(() => setBusy(false), 450)
  }

  const isWO = sheet?.kind === 'work_orders'

  const colDefs = useMemo(() => {
    const defs = [{ headerName: '', valueGetter: p => p.node.rowIndex + 1, width: 46, pinned: 'left', cellClass: 'col-idx', sortable: false, filter: false }]
    if (isWO) {
      defs.push(
        { headerName: 'Status', field: 'status', width: 130, cellRenderer: PillRenderer, cellClass: 'col-blue2',
          editable: canWrite, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['open','assigned','in_progress','on_hold','resolved','closed','reopened'] } },
        { headerName: 'Priority', field: 'priority', width: 120, cellRenderer: PillRenderer, cellClass: 'col-blue2',
          editable: canWrite, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['low','medium','high','critical'] } },
      )
    }
    cols.forEach((c, idx) => {
      const cc = colorClass(c.key, c.label)
      defs.push({
        headerName: c.label, field: 'data.' + c.key,
        valueGetter: p => p.data?.data?.[c.key],
        valueSetter: p => { if (!p.data.data) p.data.data = {}; p.data.data[c.key] = p.newValue; return true },
        editable: canWrite && c.type !== 'checkbox', minWidth: 110, flex: 1, cellClass: cc,
        pinned: (frozen && idx === 0) ? 'left' : undefined,
        cellRenderer:
          c.type === 'checkbox'
            ? (p) => {
                const on = isChecked(p.value)
                return <input type="checkbox" checked={on} disabled={!canWrite}
                  onChange={() => p.node.setDataValue('data.' + c.key, !on)} />
              }
            : (c.type === 'status' || c.type === 'priority') ? PillRenderer : undefined,
        // Formula cells show the computed result; typed columns get Excel-style formatting.
        valueFormatter: p => {
          const raw = p.value
          if (isFormula(raw)) return String(evalFormula(raw, resolveCell))
          if (raw === '' || raw == null) return raw
          if (c.type === 'currency') return fmtCurrency(raw)
          if (c.type === 'number') return fmtNumber(raw)
          if (c.type === 'percent') return fmtPercent(raw)
          if (c.type === 'date') return fmtDate(raw)
          return raw
        },
        cellEditor: (c.type === 'select' || c.type === 'status' || c.type === 'priority') ? 'agSelectCellEditor'
          : c.type === 'date' ? 'agDateStringCellEditor' : undefined,
        cellEditorParams: c.options ? { values: c.options } : undefined,
        // per-cell Excel formatting stored in row.data._fmt[key]
        cellStyle: p => {
          const f = p.data?.data?._fmt?.[c.key]; if (!f) return null
          return {
            fontWeight: f.b ? '700' : undefined,
            fontStyle: f.i ? 'italic' : undefined,
            textDecoration: f.u ? 'underline' : undefined,
            backgroundColor: f.bg || undefined,
            color: f.color || undefined,
            textAlign: f.align || undefined,
            border: f.bd ? '1px solid #64748b' : undefined,
          }
        },
      })
    })
    return defs
  }, [cols, isWO, canWrite, frozen, resolveCell])

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true, filter: true, minWidth: 110 }), [])

  // Excel-like big grid: show up to 10,000 rows. Real (saved) rows sit on top;
  // the rest are lightweight virtual placeholders that become real on first edit.
  const TOTAL_ROWS = 10000
  const displayRows = useMemo(() => {
    const out = rows.slice()
    for (let i = rows.length; i < TOTAL_ROWS; i++) out.push({ __v: true, _vi: i, data: {} })
    return out
  }, [rows])
  const getRowId = useCallback((p) => p.data.id ? String(p.data.id) : 'v' + p.data._vi, [])

  const onCellValueChanged = useCallback(async (e) => {
    // Virtual (unsaved) row: create it in the DB on first edit.
    if (!e.data.id) {
      const sh = sheetRef.current; if (!sh) return
      const { data: ins, error } = await supabase.from('rows')
        .insert({ sheet_id: sh.id, data: e.data.data || {}, source_system: 'manual' })
        .select().single()
      if (error) { setErr(error.message); return }
      setRows(rs => [...rs, ins])
      e.api.refreshCells({ force: true })
      return
    }
    // record for undo (skip while an undo is being applied)
    if (!undoingRef.current && e.colDef.field) {
      undoRef.current.push({ rowId: e.data.id, colId: e.colDef.field, old: e.oldValue })
      if (undoRef.current.length > 100) undoRef.current.shift()
    }
    const patch = e.colDef.field === 'status' ? { status: e.newValue }
      : e.colDef.field === 'priority' ? { priority: e.newValue }
      : { data: e.data.data }
    const { error } = await supabase.from('rows').update(patch).eq('id', e.data.id)
    if (error) setErr(error.message)
    // recompute any formulas that depend on the changed cell
    e.api.refreshCells({ force: true })
    // keep the formula bar in sync with the edited cell
    const field = e.colDef.field
    if (field && field.startsWith('data.')) {
      const key = field.slice(5)
      setFx(f => (f.rowId === e.data.id && f.key === key) ? { ...f, value: e.data.data?.[key] == null ? '' : String(e.data.data[key]) } : f)
    }
  }, [])

  // Insert a cell reference (e.g. "A5") into the formula being typed in the bar.
  function insertRefIntoFx(ref) {
    const el = fxInputRef.current
    setFx(f => {
      const val = f.value || ''
      let pos = fxCursorRef.current
      if (pos == null || pos > val.length) pos = val.length
      const nv = val.slice(0, pos) + ref + val.slice(pos)
      const np = pos + ref.length
      fxCursorRef.current = np
      requestAnimationFrame(() => { if (el) { el.focus(); try { el.setSelectionRange(np, np) } catch { /* noop */ } } })
      return { ...f, value: nv }
    })
  }

  // Formula bar: reflect the clicked cell — OR, while building a formula,
  // clicking a cell inserts its reference (Excel-style point & click).
  const onCellClicked = useCallback((e) => {
    const field = e.colDef.field
    const colIdx = field && field.startsWith('data.') ? colsRef.current.findIndex(c => c.key === field.slice(5)) : -1
    const ref = colIdx >= 0 ? colLetter(colIdx) + (e.rowIndex + 1) : null

    if (fxArmedRef.current && fx.rowId && ref) { insertRefIntoFx(ref); return }

    if (!field || !field.startsWith('data.')) { setFx({ label: '', value: '', rowId: null, key: null }); return }
    const key = field.slice(5)
    const raw = e.data?.data?.[key]
    setFx({ label: ref || '?', value: raw == null ? '' : String(raw), rowId: e.data.id || null, key })
  }, [fx.rowId])

  async function commitFx() {
    fxArmedRef.current = false
    if (!fx.key) return
    if (!fx.rowId) {
      // virtual row: create it
      const sh = sheetRef.current; if (!sh) return
      const { data: ins, error } = await supabase.from('rows')
        .insert({ sheet_id: sh.id, data: { [fx.key]: fx.value }, source_system: 'manual' }).select().single()
      if (error) return setErr(error.message)
      setRows(rs => [...rs, ins]); setFx(f => ({ ...f, rowId: ins.id }))
      return
    }
    const row = rowsRef.current.find(r => r.id === fx.rowId); if (!row) return
    if (!row.data) row.data = {}
    row.data[fx.key] = fx.value
    const { error } = await supabase.from('rows').update({ data: row.data }).eq('id', fx.rowId)
    if (error) return setErr(error.message)
    gridRef.current?.api.refreshCells({ force: true })
  }

  // ---- formula autocomplete (Excel-style function dropdown) ----
  function updateFnAc(value, caret) {
    if (!(value || '').trim().startsWith('=')) { setFnAc(null); return }
    const before = value.slice(0, caret == null ? value.length : caret)
    const m = /([A-Za-z]+)$/.exec(before)
    if (!m) { setFnAc(null); return }
    const token = m[1].toUpperCase()
    const items = FN_LIST.filter(f => f[0].startsWith(token))
    setFnAc(items.length ? { items: items.slice(0, 8), active: 0 } : null)
  }
  function acceptFn(name) {
    const el = fxInputRef.current
    const caret = fxCursorRef.current ?? (fx.value || '').length
    const before = (fx.value || '').slice(0, caret).replace(/([A-Za-z]+)$/, name + '(')
    const after = (fx.value || '').slice(caret)
    const nv = before + after
    const np = before.length
    fxCursorRef.current = np
    setFnAc(null)
    setFx(f => ({ ...f, value: nv }))
    requestAnimationFrame(() => { if (el) { el.focus(); try { el.setSelectionRange(np, np) } catch { /* noop */ } } })
  }

  // ---- focused-cell helpers ----
  const gApi = () => gridRef.current?.api
  const focusedCell = () => gApi()?.getFocusedCell()
  function focusedColKey() { const c = focusedCell(); if (!c) return null; const id = c.column.getColId(); return id.startsWith('data.') ? id.slice(5) : null }

  // ---- insert / delete rows ----
  async function insertRow(where) {
    if (!sheet) { setMenu(null); return }
    const cell = focusedCell()
    const idx = cell ? cell.rowIndex : rows.length - 1
    const t = (r) => r ? new Date(r.created_at).getTime() : null
    const cur = rows[idx]
    let ts
    if (where === 'above') { const prev = rows[idx - 1]; const a = t(prev), b = t(cur) || Date.now(); ts = a ? (a + b) / 2 : (b - 1000) }
    else { const next = rows[idx + 1]; const a = t(cur) || Date.now(), b = t(next); ts = b ? (a + b) / 2 : (a + 1000) }
    const { error } = await supabase.from('rows').insert({ sheet_id: sheet.id, data: {}, source_system: 'manual', created_at: new Date(ts).toISOString() })
    setMenu(null)
    if (error) return setErr(error.message)
    selectSheet(sheet)
  }
  async function deleteFocusedRow() {
    setMenu(null)
    const cell = focusedCell(); if (!cell) return setErr('Click a cell in the row to delete.')
    const node = gApi().getDisplayedRowAtIndex(cell.rowIndex); if (!node?.data) return
    await supabase.from('rows').delete().eq('id', node.data.id)
    setRows(rs => rs.filter(r => r.id !== node.data.id))
  }

  // ---- insert / delete columns ----
  async function relabelGrid() {
    if (sheet?.kind === 'work_orders') return
    const { data: c } = await supabase.from('sheet_columns').select('*').eq('sheet_id', sheet.id).order('position')
    const list = c || []
    for (let i = 0; i < list.length; i++) { const want = colLetter(i); if (list[i].label !== want) await supabase.from('sheet_columns').update({ label: want }).eq('id', list[i].id) }
  }
  async function insertCol(side) {
    setMenu(null)
    if (!sheet) return
    const colKey = focusedColKey()
    const tgt = cols.find(x => x.key === colKey)
    const base = tgt ? tgt.position : cols.length
    const pos = side === 'left' ? base : base + 1
    for (const col of cols) { if (col.position >= pos) await supabase.from('sheet_columns').update({ position: col.position + 1 }).eq('id', col.id) }
    const key = 'col_' + Date.now().toString(36)
    const { error } = await supabase.from('sheet_columns').insert({ sheet_id: sheet.id, key, label: 'New', type: 'text', position: pos })
    if (error) return setErr(error.message)
    await relabelGrid()
    selectSheet(sheet)
  }
  async function deleteFocusedColumn() {
    setMenu(null)
    const colKey = focusedColKey(); if (!colKey) return setErr('Click a cell in the column to delete.')
    const tgt = cols.find(x => x.key === colKey); if (!tgt) return
    if (cols.length <= 1) return setErr('A sheet needs at least one column.')
    await supabase.from('sheet_columns').delete().eq('id', tgt.id)
    for (const col of cols) { if (col.position > tgt.position) await supabase.from('sheet_columns').update({ position: col.position - 1 }).eq('id', col.id) }
    await relabelGrid()
    selectSheet(sheet)
  }

  // ---- column type / format ----
  async function setColumnType(type) {
    setMenu(null)
    const colKey = focusedColKey(); if (!colKey) return setErr('Click a cell in the column first, then choose a type.')
    const tgt = cols.find(x => x.key === colKey); if (!tgt) return
    if (type === 'select') { setSelectDlg({ id: tgt.id, key: colKey, value: (tgt.options || []).join(', ') }); return }
    const { error } = await supabase.from('sheet_columns').update({ type }).eq('id', tgt.id)
    if (error) return setErr(error.message)
    selectSheet(sheet)
  }
  async function saveSelectOptions() {
    const opts = selectDlg.value.split(',').map(s => s.trim()).filter(Boolean)
    await supabase.from('sheet_columns').update({ type: 'select', options: opts }).eq('id', selectDlg.id)
    setSelectDlg(null)
    selectSheet(sheet)
  }

  // ---- find & replace ----
  async function replaceAll(find, repl, matchCase) {
    if (!find) return 0
    let count = 0
    const updates = []
    const flags = matchCase ? 'g' : 'gi'
    const esc = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(esc, flags)
    rows.forEach(r => {
      let changed = false
      cols.forEach(c => {
        const v = r.data?.[c.key]
        if (v == null || typeof v !== 'string' && typeof v !== 'number') return
        const s = String(v)
        if (re.test(s)) { r.data[c.key] = s.replace(re, repl); changed = true; count++; re.lastIndex = 0 }
      })
      if (changed) updates.push(r)
    })
    for (const r of updates) await supabase.from('rows').update({ data: r.data }).eq('id', r.id)
    gApi()?.refreshCells({ force: true })
    return count
  }
  function findNext(find, matchCase) {
    if (!find) return false
    const api = gApi(); if (!api) return false
    const f = matchCase ? find : find.toLowerCase()
    const cur = api.getFocusedCell()
    const startRow = cur ? cur.rowIndex : -1
    for (let i = 1; i <= rows.length; i++) {
      const ri = (startRow + i) % rows.length
      const r = rows[ri]
      for (const c of cols) {
        let v = r.data?.[c.key]; if (v == null) continue
        v = String(v); if (!matchCase) v = v.toLowerCase()
        if (v.includes(f)) { api.ensureIndexVisible(ri); api.setFocusedCell(ri, 'data.' + c.key); return true }
      }
    }
    return false
  }

  // ---- undo ----
  function doUndo() {
    const u = undoRef.current.pop(); if (!u) return
    const api = gApi(); if (!api) return
    let node = null
    api.forEachNode(n => { if (n.data?.id === u.rowId) node = n })
    if (!node) return
    undoingRef.current = true
    node.setDataValue(u.colId, u.old)
    setTimeout(() => { undoingRef.current = false }, 0)
  }

  // keyboard: Ctrl/Cmd+Z = undo, Ctrl/Cmd+H = find & replace
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); doUndo() }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); setShowFR(true) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, []) // eslint-disable-line

  // ---- CSV export (download the sheet like Excel) ----
  function exportCsv() {
    if (!sheet) return
    const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }
    const header = cols.map(c => esc(c.label)).join(',')
    const body = rows.map(r => cols.map(c => esc(r.data?.[c.key])).join(',')).join('\n')
    const csv = header + '\n' + body
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = (sheet.name || 'sheet') + '.csv'
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  async function addRow() {
    if (!sheet) return
    const { data, error } = await supabase.from('rows')
      .insert({ sheet_id: sheet.id, data: {}, status: isWO ? 'open' : null, priority: isWO ? 'medium' : null, source_system: 'manual' })
      .select().single()
    if (error) return setErr(error.message)
    setRows(r => [...r, data])
  }
  // New sheet = blank Excel grid: columns A–AX (50) and a 10,000-row virtual grid.
  // Open the naming dialog (in-app, works on mobile — no native prompt()).
  function newSheet() { setNameDlg({ mode: 'new', value: 'Sheet1' }) }

  // Actually create a blank Excel sheet: 50 columns (A–AX) + 10,000-row virtual grid.
  async function doCreateSheet(name) {
    if (!firstWsId) return setErr('No workspace found. Run the schema first.')
    const { data, error } = await supabase.from('sheets').insert({ workspace_id: firstWsId, name, kind: 'grid' }).select().single()
    if (error) return setErr(error.message)
    const colRows = []
    for (let i = 0; i < 50; i++) colRows.push({ sheet_id: data.id, key: 'col_' + colLetter(i).toLowerCase(), label: colLetter(i), type: 'text', position: i + 1 })
    await supabase.from('sheet_columns').insert(colRows)
    // No pre-created rows — the grid shows 10,000 virtual rows that become real on first edit.
    loadTree(data.id)
  }
  async function submitNameDlg() {
    const d = nameDlg; if (!d || !d.value.trim()) return
    setNameDlg(null)
    if (d.mode === 'new') doCreateSheet(d.value.trim())
    else {
      if (d.value.trim() === d.sheet.name) return
      const { error } = await supabase.from('sheets').update({ name: d.value.trim() }).eq('id', d.sheet.id)
      if (error) return setErr(error.message)
      loadTree(d.sheet.id)
    }
  }
  async function addColumn() {
    if (!sheet) return
    const key = 'col_' + colLetter(cols.length).toLowerCase()
    const label = colLetter(cols.length)
    const { error } = await supabase.from('sheet_columns').insert({ sheet_id: sheet.id, key, label, type: 'text', position: cols.length + 1 })
    if (error) return setErr(error.message)
    selectSheet(sheet)
  }
  function renameSheet(s) { setNameDlg({ mode: 'rename', value: s.name, sheet: s }) }
  async function reallyDeleteSheet(s) {
    await supabase.from('rows').delete().eq('sheet_id', s.id)
    await supabase.from('sheet_columns').delete().eq('sheet_id', s.id)
    const { error } = await supabase.from('sheets').delete().eq('id', s.id)
    if (error) return setErr(error.message)
    if (sheet?.id === s.id) setSheet(null)
    setConfirmDel(null)
    loadTree()
  }

  // Apply bold/italic/underline/fill to the focused cell and persist in row.data._fmt.
  async function applyFormat(kind, value) {
    const api = gridRef.current?.api; if (!api) return
    const cell = api.getFocusedCell(); if (!cell) return setErr('Click a cell first, then format.')
    const node = api.getDisplayedRowAtIndex(cell.rowIndex); if (!node?.data) return
    const field = cell.column.getColId()            // e.g. "data.col_a"
    const key = field.startsWith('data.') ? field.slice(5) : field
    const row = node.data
    if (!row.data) row.data = {}
    if (!row.data._fmt) row.data._fmt = {}
    const f = row.data._fmt[key] || {}
    if (kind === 'bg') f.bg = value
    else if (kind === 'color') f.color = value
    else if (kind === 'align') f.align = (f.align === value ? '' : value)
    else f[kind] = !f[kind]            // b / i / u / bd toggles
    row.data._fmt[key] = f
    await supabase.from('rows').update({ data: row.data }).eq('id', row.id)
    api.refreshCells({ rowNodes: [node], force: true })
  }

  // Excel-style paste: drop TSV/multiline clipboard text into cells from the focused cell.
  async function handlePaste(e) {
    if (!canWrite || !sheet) return
    const api = gridRef.current?.api; if (!api) return
    const cell = api.getFocusedCell(); if (!cell) return
    const text = e.clipboardData?.getData('text/plain'); if (!text) return
    const grid = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t'))
    if (grid.length === 1 && grid[0].length === 1) return  // single value → let AG Grid handle normally
    e.preventDefault()
    const field = cell.column.getColId()
    const startKey = field.startsWith('data.') ? field.slice(5) : field
    const startCol = cols.findIndex(c => c.key === startKey)
    if (startCol < 0) return
    const startRow = cell.rowIndex
    const updates = []
    const inserts = []
    grid.forEach((line, r) => {
      const node = api.getDisplayedRowAtIndex(startRow + r)
      if (!node?.data) return
      if (!node.data.data) node.data.data = {}
      line.forEach((val, cIdx) => {
        const col = cols[startCol + cIdx]; if (!col) return
        node.data.data[col.key] = val
      })
      if (node.data.id) updates.push(node.data)
      else inserts.push({ sheet_id: sheet.id, data: node.data.data, source_system: 'manual' })
    })
    for (const row of updates) await supabase.from('rows').update({ data: row.data }).eq('id', row.id)
    if (inserts.length) await supabase.from('rows').insert(inserts)
    if (inserts.length) selectSheet(sheet)  // reload to pick up new rows
    else api.refreshCells({ force: true })
  }

  const setQuickFilter = (v) => { setQuick(v); gridRef.current?.api.setGridOption('quickFilterText', v) }

  return (
    <div className={'shell' + (view === 'admin' ? ' admin-mode' : '') + (treeCollapsed && view !== 'admin' ? ' tree-collapsed' : '')}>
      <IconRail view={view} onView={changeView} onCreate={newSheet} onSearch={openSearch}
        onNotif={() => setShowNotif(v => !v)} notifCount={notifCount} initials={initials} isAdmin={isAdmin}
        canWrite={canWrite} onProfile={() => setShowProfile(v => !v)} />

      {view === 'admin' && isAdmin ? (
        <AdminPanel />
      ) : (
      <>
      {/* tree */}
      <div className="tree">
        <div className="head"><span>Sheets</span>{canWrite && <button title="New sheet" onClick={newSheet}>+</button>}</div>
        {tree.length === 0 && (
          <div className="empty tree-empty" style={{ padding: '24px 14px', fontSize: 12.5 }}>
            {canWrite ? 'No sheets yet.' : (
              <>
                <div style={{ fontSize: 26, marginBottom: 8 }}>🔒</div>
                <div style={{ fontWeight: 600, color: '#3a3f4b', marginBottom: 4 }}>No sheets shared with you yet</div>
                <div style={{ color: '#8a91a0', marginBottom: 12 }}>Ask an admin for access to a sheet or folder.</div>
                <button className="btn sm" onClick={() => setShowReq(true)}>Request access</button>
              </>
            )}
          </div>
        )}
        {tree.map(o => (
          <div key={o.id}>
            <div className="node ws"><span className="ico">🏢</span>{o.name}</div>
            {o.depts.map(d => (
              <div key={d.id}>
                <div className="node folder"><span className="ico">📁</span>{d.name}</div>
                {d.wss.map(w => (
                  <div key={w.id}>
                    <div className="node folder" style={{ paddingLeft: 30 }}><span className="ico">📂</span>{w.name}</div>
                    {w.sheets.map(s => (
                      <div key={s.id} className={'sheet-row' + (sheet && sheet.id === s.id ? ' active' : '')}>
                        <button className="node sheet" onClick={() => selectSheet(s)}>
                          <span className="ico">▦</span>{s.name}
                        </button>
                        {canWrite && (
                          <span className="sheet-actions">
                            <button title="Rename" onClick={() => renameSheet(s)}>✎</button>
                            <button title="Delete" onClick={() => setConfirmDel(s)}>🗑</button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
        <div className="spacer" />
        <div className="userbox"><div className="name">{profile?.full_name || profile?.email}</div><div className="role">{role.replace(/_/g, ' ')}</div></div>
      </div>

      {/* work */}
      <div className="work">
        {/* top menu bar */}
        <div className="topmenu">
          <button className="mi mi-toggle" title={treeCollapsed ? 'Show sheets' : 'Hide sheets (full view)'} onClick={() => setTreeCollapsed(c => !c)}>{treeCollapsed ? '▸' : '☰'}</button>
          <button className="mi">File</button>
          <button className="mi">Automation</button>
          <button className="mi">Forms</button>
          <button className="mi">Connections</button>
          <button className="mi">Dynamic View</button>
          <span className="doc">
            <Mark size={16} />
            {sheet ? sheet.name : 'smartsheet'}
          </span>
          <button className="topmenu-search" onClick={openSearch} title="Search (sheets)">🔍 Search…</button>
          <div className="topmenu-avatar-wrap">
            <button className="topmenu-avatar" onClick={() => setShowProfile(v => !v)} title={profile?.full_name || profile?.email}>{initials}</button>
            <ProfileMenu open={showProfile} onClose={() => setShowProfile(false)} isAdmin={isAdmin}
              onAdmin={() => setView('admin')} onSettings={() => setShowSettings(true)} onComingSoon={setSoon} />
          </div>
        </div>

        {/* grid toolbar */}
        <div className="toolbar">
          {canWrite && <button className="tbtn primary" onClick={addRow}>+ New row</button>}
          {canWrite && <button className="tbtn" onClick={addColumn}>▥ Add column</button>}
          {canWrite && <><span className="sep" />
          <button className="tbtn icon" title="Bold (focused cell)" onClick={() => applyFormat('b')}><b>B</b></button>
          <button className="tbtn icon" title="Italic (focused cell)" onClick={() => applyFormat('i')}><i>I</i></button>
          <button className="tbtn icon" title="Underline (focused cell)" onClick={() => applyFormat('u')}><u>U</u></button>
          <label className="tbtn icon fill-btn" title="Fill color (focused cell)">🎨
            <input type="color" onChange={e => applyFormat('bg', e.target.value)} />
          </label>
          <label className="tbtn icon fill-btn" title="Text color (focused cell)"><b style={{ color: '#e5484d' }}>A</b>
            <input type="color" onChange={e => applyFormat('color', e.target.value)} />
          </label>
          <button className="tbtn icon" title="Clear fill / color" onClick={() => { applyFormat('bg', ''); applyFormat('color', '') }}>⊘</button>
          <span className="sep" />
          <button className="tbtn icon" title="Align left" onClick={() => applyFormat('align', 'left')}>⬅</button>
          <button className="tbtn icon" title="Align center" onClick={() => applyFormat('align', 'center')}>⬌</button>
          <button className="tbtn icon" title="Align right" onClick={() => applyFormat('align', 'right')}>➡</button>
          <button className="tbtn icon" title="Toggle border" onClick={() => applyFormat('bd')}>▢</button>
          <span className="sep" />
          <button className={'tbtn icon' + (frozen ? ' on' : '')} title="Freeze first column" onClick={() => setFrozen(f => !f)}>❄</button>
          <span className="sep" />
          {/* Insert menu */}
          <div className="tb-drop">
            <button className="tbtn" onClick={() => setMenu(m => m === 'insert' ? null : 'insert')}>➕ Insert ▾</button>
            {menu === 'insert' && (
              <div className="tb-menu">
                <button onClick={() => insertRow('above')}>Row above</button>
                <button onClick={() => insertRow('below')}>Row below</button>
                <button onClick={() => insertCol('left')}>Column left</button>
                <button onClick={() => insertCol('right')}>Column right</button>
              </div>
            )}
          </div>
          {/* Delete menu */}
          <div className="tb-drop">
            <button className="tbtn" onClick={() => setMenu(m => m === 'delete' ? null : 'delete')}>🗑 Delete ▾</button>
            {menu === 'delete' && (
              <div className="tb-menu">
                <button onClick={deleteFocusedRow}>Delete row</button>
                <button onClick={deleteFocusedColumn}>Delete column</button>
              </div>
            )}
          </div>
          {/* Format / cell type menu */}
          <div className="tb-drop">
            <button className="tbtn" onClick={() => setMenu(m => m === 'format' ? null : 'format')}>🔠 Type ▾</button>
            {menu === 'format' && (
              <div className="tb-menu">
                <button onClick={() => setColumnType('text')}>Text</button>
                <button onClick={() => setColumnType('number')}>Number (1,234)</button>
                <button onClick={() => setColumnType('currency')}>Currency (₹)</button>
                <button onClick={() => setColumnType('percent')}>Percent (%)</button>
                <button onClick={() => setColumnType('date')}>Date</button>
                <button onClick={() => setColumnType('checkbox')}>Checkbox ☑</button>
                <button onClick={() => setColumnType('select')}>Dropdown…</button>
              </div>
            )}
          </div>
          <button className="tbtn" title="Find & Replace (Ctrl+H)" onClick={() => setShowFR(true)}>🔎 Find/Replace</button>
          <button className="tbtn icon" title="Undo (Ctrl+Z)" onClick={doUndo}>↶</button>
          <span className="sep" />
          <button className="tbtn" title="Download as CSV" onClick={exportCsv}>⬇ CSV</button>
          {sheet && <button className="tbtn primary" title="Share this sheet by email" onClick={() => setShowShare(true)}>🔗 Share</button>}</>}
          <span className="sep" />
          <button className="tbtn" onClick={() => setShowImport(true)}>⬇ Import from Smartsheet</button>
          {sheet && !canWrite && <button className="tbtn" onClick={() => setShowReq(true)}>🔒 Request access</button>}
          <span className="spacer" />
          <input id="gf-search" className="search" placeholder="🔍 Search…" value={quick} onChange={e => setQuickFilter(e.target.value)} />
          <span className="count">{rows.length} rows</span>
        </div>

        {/* formula bar (Excel-style) */}
        {sheet && (
          <div className="fxbar">
            <span className="fxcell">{fx.label || '—'}</span>
            <span className="fxsym">ƒx</span>
            <div className="fx-acwrap">
              <input ref={fxInputRef} className="fxinput" value={fx.value} disabled={!canWrite || !fx.rowId}
                placeholder={fx.rowId ? 'Type =SUM… for suggestions, then click cells to add refs' : 'Click a cell to edit…'}
                onChange={e => { const v = e.target.value; fxCursorRef.current = e.target.selectionStart; fxArmedRef.current = v.trim().startsWith('='); setFx(f => ({ ...f, value: v })); updateFnAc(v, e.target.selectionStart) }}
                onFocus={e => { fxCursorRef.current = e.target.selectionStart; fxArmedRef.current = (fx.value || '').trim().startsWith('=') }}
                onSelect={e => { fxCursorRef.current = e.target.selectionStart }}
                onKeyUp={e => { fxCursorRef.current = e.target.selectionStart; if (!['Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) updateFnAc(e.target.value, e.target.selectionStart) }}
                onClick={e => { fxCursorRef.current = e.target.selectionStart }}
                onKeyDown={e => {
                  if (fnAc) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setFnAc(a => ({ ...a, active: (a.active + 1) % a.items.length })); return }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setFnAc(a => ({ ...a, active: (a.active - 1 + a.items.length) % a.items.length })); return }
                    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptFn(fnAc.items[fnAc.active][0]); return }
                    if (e.key === 'Escape') { e.preventDefault(); setFnAc(null); return }
                  }
                  if (e.key === 'Enter') { e.preventDefault(); commitFx() }
                  else if (e.key === 'Escape') { fxArmedRef.current = false; e.target.blur() }
                }}
                onBlur={() => { if (fxArmedRef.current) setTimeout(() => { if (fxArmedRef.current) fxInputRef.current?.focus() }, 0) }} />
              {fnAc && (
                <div className="fx-ac">
                  {fnAc.items.map((f, i) => (
                    <button key={f[0]} className={'fx-ac-item' + (i === fnAc.active ? ' on' : '')}
                      onMouseDown={e => { e.preventDefault(); acceptFn(f[0]) }}
                      onMouseEnter={() => setFnAc(a => (a ? { ...a, active: i } : a))}>
                      <b>{f[0]}</b><span>{f[1]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {(fx.value || '').trim().startsWith('=') && <span className="fxhint">↑↓ pick · Tab/Enter insert · click cells for refs</span>}
          </div>
        )}

        {err && <div className="err" style={{ padding: '6px 12px' }}>{err}</div>}

        <div className="grid-wrap ag-theme-quartz" onPaste={handlePaste}>
          {sheet ? (
            <AgGridReact ref={gridRef} rowData={displayRows} columnDefs={colDefs} defaultColDef={defaultColDef}
              getRowId={getRowId}
              onCellValueChanged={onCellValueChanged} onCellClicked={onCellClicked}
              enterNavigatesVertically enterNavigatesVerticallyAfterEdit
              rowBuffer={20} enableCellTextSelection stopEditingWhenCellsLoseFocus />
          ) : (
            <div className="empty">{loading ? 'Loading…' : 'Select a sheet on the left, or Import from Smartsheet.'}</div>
          )}
        </div>
      </div>
      </>
      )}

      {showImport && (
        <ImportModal workspaceId={firstWsId} onClose={() => setShowImport(false)} onDone={(s) => { setShowImport(false); loadTree(s.id) }} />
      )}

      {showReq && <RequestAccess sheet={sheet} onClose={() => setShowReq(false)} />}

      {showShare && sheet && <ShareModal sheet={sheet} onClose={() => setShowShare(false)} />}

      {nameDlg && (
        <SimpleModal title={nameDlg.mode === 'new' ? 'New Excel sheet' : 'Rename sheet'} onClose={() => setNameDlg(null)}>
          <p style={{ fontSize: 13, color: '#69707d', marginBottom: 10, lineHeight: 1.5 }}>
            {nameDlg.mode === 'new'
              ? 'Creates a blank Excel sheet — columns A–AX, 10,000 rows, with formulas, formatting, cell types and everything.'
              : 'Enter a new name for this sheet.'}
          </p>
          <input className="fr-in" style={{ width: '100%' }} autoFocus value={nameDlg.value}
            placeholder="Sheet name"
            onChange={e => setNameDlg(d => ({ ...d, value: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') submitNameDlg() }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn ghost" onClick={() => setNameDlg(null)}>Cancel</button>
            <button className="btn" onClick={submitNameDlg}>{nameDlg.mode === 'new' ? 'Create sheet' : 'Rename'}</button>
          </div>
        </SimpleModal>
      )}

      {showFR && (
        <FindReplace cols={cols} rows={rows} onClose={() => setShowFR(false)}
          onReplaceAll={replaceAll} onFindNext={findNext} />
      )}

      {selectDlg && (
        <SimpleModal title="Dropdown options" onClose={() => setSelectDlg(null)}>
          <p style={{ fontSize: 13, color: '#3a3f4b', marginBottom: 10 }}>Comma-separated list of choices for this column:</p>
          <input className="fr-in" style={{ width: '100%' }} autoFocus value={selectDlg.value}
            placeholder="e.g. Open, In Progress, Done"
            onChange={e => setSelectDlg(d => ({ ...d, value: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') saveSelectOptions() }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn ghost" onClick={() => setSelectDlg(null)}>Cancel</button>
            <button className="btn" onClick={saveSelectOptions}>Save</button>
          </div>
        </SimpleModal>
      )}

      <Notifications open={showNotif} onClose={() => setShowNotif(false)} isApprover={isApprover} onCount={setNotifCount} />

      <SearchModal open={showSearch} onClose={() => setShowSearch(false)}
        sheets={allSheets(tree)} recents={recents} onPick={(s) => { if (view === 'admin') setView('browse'); selectSheet(s) }} />

      {confirmDel && (
        <SimpleModal title="Delete sheet?" onClose={() => setConfirmDel(null)}>
          <p style={{ fontSize: 13.5, color: '#3a3f4b', lineHeight: 1.6 }}>
            Delete <b>{confirmDel.name}</b> and all its rows and columns? This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
            <button className="btn" style={{ background: '#e5484d' }} onClick={() => reallyDeleteSheet(confirmDel)}>Delete</button>
          </div>
        </SimpleModal>
      )}

      {soon && (
        <SimpleModal title={soon} onClose={() => setSoon('')}>
          <p style={{ fontSize: 13.5, color: '#3a3f4b', lineHeight: 1.6 }}>
            <b>{soon}</b> is coming soon. This section is planned for a future update.
          </p>
        </SimpleModal>
      )}

      {showSettings && (
        <SimpleModal title="Personal Settings" onClose={() => setShowSettings(false)}>
          <div style={{ fontSize: 13.5, color: '#3a3f4b', lineHeight: 1.8 }}>
            <div><b>Name:</b> {profile?.full_name || '—'}</div>
            <div><b>Email:</b> {profile?.email}</div>
            <div><b>Role:</b> {role.replace(/_/g, ' ')}</div>
            <p style={{ marginTop: 12, color: '#69707d', fontSize: 12.5 }}>
              More settings (password, theme, notifications) coming soon.
            </p>
          </div>
        </SimpleModal>
      )}

      <Loader show={busy} label={busyLabel} />
    </div>
  )
}

function Gate() {
  const { session, loading } = useAuth()
  if (loading) return <div className="center">Loading…</div>
  if (!session) return <Login />
  return <Workspace />
}
export default function App() { return <AuthProvider><Gate /></AuthProvider> }
