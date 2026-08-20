import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import FormulaEditor, { FN_LIST, formulaBridge } from './components/FormulaEditor.jsx'
import FormEntry from './components/FormEntry.jsx'

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
// Date + time for the "Uploaded" column (when a row was added).
function fmtDateTime(v) { if (!v) return ''; const d = new Date(v); return isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
// How long a refresh took — shown in seconds (or minutes), never milliseconds.
function fmtDuration(ms) {
  if (ms == null) return '—'
  const s = ms / 1000
  if (s < 60) return (s < 10 ? s.toFixed(1) : Math.round(s)) + ' sec'
  const m = Math.floor(s / 60), rem = Math.round(s % 60)
  return rem ? `${m} min ${rem} sec` : `${m} min`
}
const isChecked = (v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'TRUE'

// Custom grid header: single-click sorts, double-click opens the column editor
// (rename / set type / dropdown options).
function GridHeader(props) {
  const sort = props.column?.getSort?.()
  return (
    <div className="gf-hdr" title="Double-click to rename or change type"
      onClick={() => props.progressSort && props.progressSort()}
      onDoubleClick={() => props.onRename && props.onRename(props.colKey)}>
      <span className="gf-hdr-label">{props.displayName}</span>
      {sort === 'asc' && <span className="gf-hdr-sort">▲</span>}
      {sort === 'desc' && <span className="gf-hdr-sort">▼</span>}
      {props.onRefresh && <button className="gf-hdr-refresh" title="Refresh this column (reload latest data)"
        onClick={(e) => { e.stopPropagation(); props.onRefresh(props.colKey) }}>🔄</button>}
    </div>
  )
}

// Toolbar dropdown whose menu renders in a body portal, so it is never clipped
// by the horizontally-scrolling toolbar's overflow.
function TbDrop({ label, title, open, onToggle, children }) {
  const btnRef = useRef(null)
  const [pos, setPos] = useState(null)
  useEffect(() => {
    if (!open) return
    const place = () => { const el = btnRef.current; if (el) { const r = el.getBoundingClientRect(); setPos({ left: r.left, top: r.bottom + 4 }) } }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])
  return (
    <div className="tb-drop">
      <button ref={btnRef} className="tbtn" title={title} onClick={onToggle}>{label}</button>
      {open && pos && createPortal(
        <div className="tb-menu tb-menu-fixed" style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999 }}>
          {children}
        </div>, document.body)}
    </div>
  )
}

// Evaluate a conditional-colour rule against a cell value.
function ruleMatches(op, cellVal, target) {
  const s = cellVal == null ? '' : String(cellVal)
  const t = target == null ? '' : String(target)
  const n = parseFloat(s), tn = parseFloat(t)
  switch (op) {
    case 'eq': return s.toLowerCase() === t.toLowerCase()
    case 'ne': return s.toLowerCase() !== t.toLowerCase()
    case 'contains': return s.toLowerCase().includes(t.toLowerCase())
    case 'empty': return s.trim() === ''
    case 'gt': return !isNaN(n) && !isNaN(tn) && n > tn
    case 'lt': return !isNaN(n) && !isNaN(tn) && n < tn
    default: return false
  }
}
const OP_LABEL = { contains: 'contains', eq: '=', ne: '≠', gt: '>', lt: '<', empty: 'is empty' }

// Small form to add a conditional-colour rule.
function RuleAdder({ cols, onAdd }) {
  const [colKey, setColKey] = useState(cols[0]?.key || '')
  const [op, setOp] = useState('contains')
  const [value, setValue] = useState('')
  const [bg, setBg] = useState('#ffdede')
  return (
    <div className="rule-add">
      <select className="fr-in" value={colKey} onChange={e => setColKey(e.target.value)}>
        {cols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <select className="fr-in" value={op} onChange={e => setOp(e.target.value)}>
        <option value="contains">contains</option>
        <option value="eq">equals</option>
        <option value="ne">not equals</option>
        <option value="gt">greater than</option>
        <option value="lt">less than</option>
        <option value="empty">is empty</option>
      </select>
      {op !== 'empty' && <input className="fr-in" placeholder="value" value={value} onChange={e => setValue(e.target.value)} />}
      <label className="rule-color" title="Fill colour">🎨<input type="color" value={bg} onChange={e => setBg(e.target.value)} /></label>
      <button className="btn sm" onClick={() => { if (!colKey) return; onAdd({ colKey, op, value, bg }); setValue('') }}>Add</button>
    </div>
  )
}

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
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('gf_theme') || 'light' } catch { return 'light' } })
  const [toasts, setToasts] = useState([])    // transient action feedback
  const [saved, setSaved] = useState('idle')  // 'idle' | 'saving' | 'saved'
  const [ctx, setCtx] = useState(null)        // right-click context menu { x, y }
  const [colDlg, setColDlg] = useState(null)  // column editor { id, key, label, type, options }
  const [showHelp, setShowHelp] = useState(false) // keyboard shortcuts panel
  const [wrap, setWrap] = useState(false)     // wrap text in cells
  const [gridLines, setGridLines] = useState(() => { try { return localStorage.getItem('gf_gridlines') !== 'off' } catch { return true } })  // Excel-style cell borders (on by default)
  const [rules, setRules] = useState([])      // conditional colour rules for current sheet
  const [rulesDlg, setRulesDlg] = useState(false)
  const [formView, setFormView] = useState(true)   // open in the entry-form view by default; switch to table via button
  const [viewAs, setViewAs] = useState('editor')   // admin only: 'editor' = full controls, 'user' = preview what a user sees (form only)
  const [favs, setFavs] = useState([])             // favorite sheet ids (per user, saved on this device)
  const [showRefreshLog, setShowRefreshLog] = useState(false)  // refresh-history modal
  const [refreshLogs, setRefreshLogs] = useState([])           // rows from refresh_logs
  const toastId = useRef(0)
  const openColRef = useRef(null)             // latest openColDlg for the grid header
  const refreshColRef = useRef(null)          // latest refreshColumn for the grid header
  const activeFxRef = useRef(null)            // active in-cell formula editor bridge (for click-to-insert refs)
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

  // Transient toast notification (auto-dismisses).
  function toast(msg, type = 'ok') {
    const id = ++toastId.current
    setToasts(t => [...t, { id, msg, type }])
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600)
  }
  // "Saved ✓" pill flashes after a successful write.
  function markSaved() {
    setSaved('saved')
    window.clearTimeout(markSaved._t)
    markSaved._t = window.setTimeout(() => setSaved('idle'), 1600)
  }

  // Apply and persist the theme (light / dark).
  useEffect(() => {
    try { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('gf_theme', theme) } catch { /* noop */ }
  }, [theme])

  // Load per-sheet conditional colour rules (stored locally, no schema change).
  useEffect(() => {
    if (!sheet) { setRules([]); return }
    try { setRules(JSON.parse(localStorage.getItem('gf_rules_' + sheet.id) || '[]')) } catch { setRules([]) }
  }, [sheet?.id]) // eslint-disable-line
  function saveRules(next) {
    setRules(next)
    try { if (sheet) localStorage.setItem('gf_rules_' + sheet.id, JSON.stringify(next)) } catch { /* noop */ }
    gridRef.current?.api.refreshCells({ force: true })
  }

  // Column editor: rename, change type, edit dropdown options.
  function openColDlg(colKey) {
    const t = colsRef.current.find(c => c.key === colKey); if (!t) return
    setColDlg({ id: t.id, key: t.key, label: t.label, type: t.type || 'text', options: (t.options || []).slice() })
  }
  openColRef.current = openColDlg

  // Record a refresh in the audit log (who, when, how long). Best-effort.
  async function logRefresh(scope, columnLabel, durationMs) {
    try {
      await supabase.from('refresh_logs').insert({
        user_id: profile?.id || null,
        user_name: profile?.full_name || null,
        user_email: profile?.email || null,
        sheet_id: sheet?.id || null,
        sheet_name: sheet?.name || null,
        scope, column_label: columnLabel || null,
        duration_ms: Math.max(0, Math.round(durationMs)),
      })
    } catch { /* table may not exist yet — ignore */ }
  }
  async function loadRefreshLogs() {
    if (!sheet) { setRefreshLogs([]); return }
    // Only this sheet's refreshes — not every sheet's.
    const { data } = await supabase.from('refresh_logs').select('*').eq('sheet_id', sheet.id).order('created_at', { ascending: false }).limit(300)
    setRefreshLogs(data || [])
  }

  // Refresh a single column: pull the latest rows from the database and
  // re-render (and re-evaluate any formulas) for that column. Timed + logged.
  // Only admins may refresh.
  async function refreshColumn(colKey) {
    if (!sheet || !isAdmin) return
    const t0 = Date.now()
    const { data } = await supabase.from('rows').select('*').eq('sheet_id', sheet.id)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(20000)
    setRows(data || [])
    const dur = Date.now() - t0
    const field = 'data.' + colKey
    setTimeout(() => { try { gridRef.current?.api?.refreshCells({ columns: [field], force: true }) } catch { /* noop */ } }, 0)
    const lbl = colsRef.current.find(c => c.key === colKey)?.label || 'Column'
    logRefresh('column', lbl, dur)
    toast(`🔄 ${lbl} refreshed (${fmtDuration(dur)})`)
  }
  refreshColRef.current = refreshColumn

  // Whole-sheet refresh (toolbar Refresh button) — timed + logged.
  async function refreshSheet() {
    if (!sheet) return
    const t0 = Date.now()
    await selectSheet(sheet)
    const dur = Date.now() - t0
    logRefresh('sheet', null, dur)
    toast(`Refreshed ✓ (${fmtDuration(dur)})`)
  }

  async function saveColDlg() {
    const d = colDlg; if (!d) return
    const patch = { label: (d.label || '').trim() || d.label, type: d.type, options: d.type === 'select' ? d.options : null }
    setColDlg(null)
    const { error } = await supabase.from('sheet_columns').update(patch).eq('id', d.id)
    if (error) return toast(error.message, 'err')
    toast('Column updated ✓'); selectSheet(sheet)
  }

  // Copy the focused cell's value to the clipboard.
  async function copyCell() {
    setCtx(null)
    const c = focusedCell(); if (!c) return
    const node = gApi()?.getDisplayedRowAtIndex(c.rowIndex)
    const id = c.column.getColId(); const key = id.startsWith('data.') ? id.slice(5) : id
    const val = node?.data?.data?.[key] ?? node?.data?.[key] ?? ''
    try { await navigator.clipboard.writeText(String(val)); toast('Copied') } catch { toast('Copy failed', 'err') }
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

  // Favorites: hydrate this user's starred sheets from storage ONCE (so a later
  // re-render never clobbers an in-progress toggle), then toggle/save them.
  const favsHydrated = useRef(false)
  useEffect(() => {
    if (!profile?.id || favsHydrated.current) return
    favsHydrated.current = true
    try { setFavs(JSON.parse(localStorage.getItem('gf_favs_' + profile.id) || '[]')) } catch { /* noop */ }
  }, [profile?.id])
  function toggleFav(id) {
    const adding = !favs.includes(id)
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      if (profile?.id) { try { localStorage.setItem('gf_favs_' + profile.id, JSON.stringify(next)) } catch { /* noop */ } }
      return next
    })
    toast(adding ? 'Added to Favorites ⭐' : 'Removed from Favorites')
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
  useEffect(() => {
    // Deep-link: ?sheet=<id> (from a share email's "Open smartsheet" button) opens that sheet directly.
    let wantSheet = null
    try { wantSheet = new URLSearchParams(window.location.search).get('sheet') } catch { /* noop */ }
    loadTree(wantSheet).finally(() => window.setTimeout(() => setBusy(false), 500))
    if (wantSheet) { try { window.history.replaceState({}, '', window.location.pathname) } catch { /* noop */ } }
  }, []) // eslint-disable-line

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
          filter: false, suppressHeaderMenuButton: true, suppressHeaderFilterButton: true,
          editable: canWrite, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['open','assigned','in_progress','on_hold','resolved','closed','reopened'] } },
        { headerName: 'Priority', field: 'priority', width: 120, cellRenderer: PillRenderer, cellClass: 'col-blue2',
          filter: false, suppressHeaderMenuButton: true, suppressHeaderFilterButton: true,
          editable: canWrite, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['low','medium','high','critical'] } },
      )
    }
    cols.forEach((c, idx) => {
      const cc = colorClass(c.key, c.label)
      defs.push({
        headerName: c.label, field: 'data.' + c.key,
        valueGetter: p => p.data?.data?.[c.key],
        valueSetter: p => { if (!p.data.data) p.data.data = {}; p.data.data[c.key] = p.newValue; return true },
        editable: canWrite && c.type !== 'checkbox', width: 120, minWidth: 60, cellClass: cc,
        pinned: (frozen && idx === 0) ? 'left' : undefined,
        headerComponent: GridHeader,
        headerComponentParams: { colKey: c.key, onRename: (k) => openColRef.current && openColRef.current(k), onRefresh: isAdmin ? ((k) => refreshColRef.current && refreshColRef.current(k)) : undefined },
        wrapText: wrap, autoHeight: wrap,
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
          : c.type === 'date' ? 'agDateStringCellEditor'
          : FormulaEditor,   // type = in any cell -> inline function dropdown, result in the same cell
        cellEditorParams: { ...(c.options ? { values: c.options } : {}), bridge: activeFxRef },
        // per-cell Excel formatting stored in row.data._fmt[key]
        cellStyle: p => {
          const f = p.data?.data?._fmt?.[c.key] || {}
          const st = {
            fontWeight: f.b ? '700' : undefined,
            fontStyle: f.i ? 'italic' : undefined,
            textDecoration: f.u ? 'underline' : undefined,
            backgroundColor: f.bg || undefined,
            color: f.color || undefined,
            textAlign: f.align || undefined,
            border: f.bd ? '1px solid #64748b' : undefined,
          }
          // conditional colour rules (only when the cell has no manual fill/colour)
          for (const rule of rules) {
            if (rule.colKey !== c.key) continue
            if (ruleMatches(rule.op, p.value, rule.value)) {
              if (rule.bg && !f.bg) st.backgroundColor = rule.bg
              if (rule.color && !f.color) st.color = rule.color
            }
          }
          return st
        },
      })
    })
    // "Uploaded" timestamp — when each entry was added (date + time).
    // Placed AFTER all data columns so it sits at the end of the row.
    defs.push({ headerName: 'Uploaded', valueGetter: p => p.data?.created_at, valueFormatter: p => fmtDateTime(p.value), width: 160, cellClass: 'col-ts', editable: false, sortable: true, filter: false })
    return defs
  }, [cols, isWO, canWrite, frozen, resolveCell, rules, wrap, isAdmin])

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
    if (error) { setErr(error.message); toast(error.message, 'err') } else { markSaved() }
    // recompute any formulas that depend on the changed cell
    e.api.refreshCells({ force: true })
    // keep the formula bar in sync with the edited cell
    const field = e.colDef.field
    if (field && field.startsWith('data.')) {
      const key = field.slice(5)
      setFx(f => (f.rowId === e.data.id && f.key === key) ? { ...f, value: e.data.data?.[key] == null ? '' : String(e.data.data[key]) } : f)
    }
  }, [])

  // When a cell enters edit mode, kill the browser's native autofill/history
  // dropdown (it was showing previously-typed values like "ko" on double-click).
  const onCellEditingStarted = useCallback(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.ag-cell-editor input, .ag-input-field-input, .ag-text-field-input')
        .forEach(el => {
          el.setAttribute('autocomplete', 'off')
          el.setAttribute('autocorrect', 'off')
          el.setAttribute('autocapitalize', 'off')
          el.setAttribute('spellcheck', 'false')
          el.setAttribute('name', 'gf-cell-' + Math.random().toString(36).slice(2))
        })
    })
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
  // Clicking a cell reflects it in the formula bar. While a formula is being
  // built there (value starts with "="), clicking cells inserts their reference
  // — Excel-style point-and-click (great for LOOKUP / SUM ranges).
  const onCellClicked = useCallback((e) => {
    // If an in-cell formula is being built, the click was already handled as a
    // reference insert (see the mousedown-capture effect) — don't touch the bar.
    const ed = document.querySelector('.ag-cell-inline-editing .fe-input2, .ag-cell-inline-editing input')
    if (ed && (ed.value || '').trim().startsWith('=')) return
    const field = e.colDef.field
    const colIdx = field && field.startsWith('data.') ? colsRef.current.findIndex(c => c.key === field.slice(5)) : -1
    const ref = colIdx >= 0 ? colLetter(colIdx) + (e.rowIndex + 1) : null
    if (fxArmedRef.current && ref) { insertRefIntoFx(ref); return }
    fxArmedRef.current = false   // just selecting a cell must NOT keep the formula bar armed
    if (!field || !field.startsWith('data.')) { setFx({ label: '', value: '', rowId: null, key: null }); return }
    const key = field.slice(5)
    const raw = e.data?.data?.[key]
    setFx({ label: ref || '?', value: raw == null ? '' : String(raw), rowId: e.data.id || null, key })
  }, [])

  // Right-click a cell -> our own context menu (Excel-style).
  const onCellContextMenu = useCallback((e) => {
    if (!canWrite) return
    if (e.event) e.event.preventDefault()
    try { if (e.rowIndex != null && e.column) e.api.setFocusedCell(e.rowIndex, e.column.getColId()) } catch { /* noop */ }
    const ev = e.event
    if (ev) setCtx({ x: ev.clientX, y: ev.clientY })
  }, [canWrite])

  // Close the context menu on any outside click / Escape.
  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    const onKey = (e) => { if (e.key === 'Escape') setCtx(null) }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey) }
  }, [ctx])

  // Excel-style point-and-click while typing a formula INSIDE a cell.
  // When the in-cell formula editor is armed (value starts with "="), a mousedown
  // on any OTHER cell inserts that cell's reference (e.g. "B5") into the formula
  // instead of closing the editor. We intercept at mousedown (capture phase) and
  // preventDefault so the editor never loses focus / commits early.
  useEffect(() => {
    const onDown = (e) => {
      // Is a formula being typed in a cell right now? (read the live editor input)
      const input = document.querySelector('.ag-cell-inline-editing .fe-input2, .ag-cell-inline-editing input')
      if (!input) return
      const val = input.value || ''
      if (!val.trim().startsWith('=')) return
      const t = e.target
      if (!t || !t.closest) return
      // clicks inside the editor itself or its function dropdown -> normal behaviour
      if (t.closest('.fe-inline') || t.closest('.fe-ac')) return
      const cell = t.closest('.ag-cell')
      if (!cell || cell.classList.contains('ag-cell-inline-editing')) return
      const colId = cell.getAttribute('col-id')
      if (!colId || !colId.startsWith('data.')) return
      const row = cell.closest('.ag-row')
      const ri = row && row.getAttribute('row-index')
      if (ri == null) return
      const colIdx = colsRef.current.findIndex(c => c.key === colId.slice(5))
      if (colIdx < 0) return
      e.preventDefault(); e.stopPropagation()
      const refStr = colLetter(colIdx) + (parseInt(ri, 10) + 1)
      // Preferred: the editor's own insertRef (updates React state so the
      // committed value is correct). Falls back to a native input write.
      const bridge = formulaBridge.current || activeFxRef.current
      if (bridge && bridge.insertRef) { bridge.insertRef(refStr); return }
      const start = input.selectionStart == null ? val.length : input.selectionStart
      const nv = val.slice(0, start) + refStr + val.slice(start)
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, nv)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      const p = start + refStr.length
      requestAnimationFrame(() => { input.focus(); try { input.setSelectionRange(p, p) } catch { /* noop */ } })
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [])

  // Close toolbar dropdowns (Insert / Delete / Type) on outside click / Escape.
  useEffect(() => {
    if (!menu) return
    const onDown = (e) => { if (!e.target.closest('.tb-drop') && !e.target.closest('.tb-menu')) setMenu(null) }
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menu])

  // (Click-to-insert cell references is handled by the formula bar — see onCellClicked.)

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

  // keyboard shortcuts
  useEffect(() => {
    const h = (e) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) { if (e.key === 'F1') { e.preventDefault(); setShowHelp(true) } return }
      const k = (e.key || '').toLowerCase()
      if (k === 'z') { e.preventDefault(); doUndo() }
      else if (k === 'h') { e.preventDefault(); setShowFR(true) }
      else if (k === 'f') { e.preventDefault(); const el = document.getElementById('gf-search'); if (el) { el.focus(); el.select?.() } }
      else if (k === 's') { e.preventDefault(); toast('Changes save automatically ✓') }
      else if (k === 'b') { e.preventDefault(); applyFormat('b') }
      else if (k === 'i') { e.preventDefault(); applyFormat('i') }
      else if (k === 'u') { e.preventDefault(); applyFormat('u') }
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
    if (row.id) { const { error } = await supabase.from('rows').update({ data: row.data }).eq('id', row.id); if (error) toast(error.message, 'err'); else markSaved() }
    else toast('Type a value in the cell first', 'err')
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

  // Non-admins only ever see the entry form. Admins can toggle table <-> form,
  // and can also switch to "User view" to preview exactly what a user sees (form only).
  const asUser = isAdmin && viewAs === 'user'
  const showForm = !!sheet && (!isAdmin || asUser || formView)

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
        {(() => {
          // One flat list of every sheet (folder groupings hidden).
          const flat = tree.flatMap(o => o.depts.flatMap(d => d.wss.flatMap(w => w.sheets)))
          const wsName = tree[0]?.name || 'Sheets'
          // The Favorites / Recents rail views filter this same list.
          let list = flat, header = wsName, headIcon = '🏢'
          if (view === 'favorites') { list = flat.filter(s => favs.includes(s.id)); header = 'Favorites'; headIcon = '⭐' }
          else if (view === 'recents') { list = recents.filter(Boolean); header = 'Recents'; headIcon = '🕘' }
          return (
            <div>
              <div className="node ws"><span className="ico">{headIcon}</span>{header}</div>
              {list.length === 0 && view === 'favorites' && (
                <div className="tree-hint">No favorites yet. Tap the ☆ on any sheet to add it here.</div>
              )}
              {list.map(s => {
                const isFav = favs.includes(s.id)
                return (
                  <div key={s.id} className={'sheet-row' + (sheet && sheet.id === s.id ? ' active' : '')}>
                    <button className="node sheet" onClick={() => { setFormView(true); selectSheet(s) }}>
                      <span className="ico">▦</span>{s.name}
                    </button>
                    <button className={'fav-star' + (isFav ? ' on' : '')} title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
                      onClick={(e) => { e.stopPropagation(); toggleFav(s.id) }}>{isFav ? '★' : '☆'}</button>
                    {canWrite && (
                      <span className="sheet-actions">
                        <button title="Rename" onClick={() => renameSheet(s)}>✎</button>
                        <button title="Delete" onClick={() => setConfirmDel(s)}>🗑</button>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })()}
        <div className="spacer" />
        <div className="userbox"><div className="name">{profile?.full_name || profile?.email}</div><div className="role">{role.replace(/_/g, ' ')}</div></div>
      </div>

      {/* work */}
      <div className="work">
        {/* top menu bar */}
        <div className="topmenu">
          <button className="mi mi-toggle" title={treeCollapsed ? 'Show sheets' : 'Hide sheets (full view)'} onClick={() => setTreeCollapsed(c => !c)}>{treeCollapsed ? '▸' : '☰'}</button>
          <span className="doc">
            <Mark size={16} />
            {sheet ? sheet.name : 'smartsheet'}
          </span>
          <button className="mi mi-round" title="Keyboard shortcuts (F1)" onClick={() => setShowHelp(true)}>?</button>
          <button className="mi mi-round" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀' : '🌙'}</button>
          <button className="topmenu-search" onClick={openSearch} title="Search (sheets)">🔍 Search…</button>
          <div className="topmenu-avatar-wrap">
            <button className="topmenu-avatar" onClick={() => setShowProfile(v => !v)} title={profile?.full_name || profile?.email}>{initials}</button>
            <ProfileMenu open={showProfile} onClose={() => setShowProfile(false)} isAdmin={isAdmin}
              onAdmin={() => setView('admin')} onSettings={() => setShowSettings(true)} onComingSoon={setSoon} />
          </div>
        </div>

        {/* grid toolbar */}
        <div className="toolbar">
          {/* admin-only: switch between the full editing view and a preview of what a user sees */}
          {isAdmin && (
            <div className="viewas" role="tablist" title="Switch between the full editor and the user's view">
              <button className={'viewas-tab' + (!asUser ? ' on' : '')} onClick={() => setViewAs('editor')}>🛠️ Editor view</button>
              <button className={'viewas-tab' + (asUser ? ' on' : '')} onClick={() => setViewAs('user')}>👤 User view</button>
            </div>
          )}
          {isAdmin && <span className="sep" />}
          {isAdmin && !asUser && sheet && <button className={'tbtn' + (formView ? ' primary' : '')} title="Switch between table and form-entry view" onClick={() => setFormView(f => !f)}>{formView ? '▦ Table view' : '📝 Form view'}</button>}
          {isAdmin && !asUser && sheet && !formView && <button className="tbtn" title="Reload the latest entries" onClick={refreshSheet}>🔄 Refresh</button>}
          {isAdmin && !asUser && sheet && !formView && <button className="tbtn" title="See who refreshed, when, and how long it took" onClick={() => { setShowRefreshLog(true); loadRefreshLogs() }}>📋 Refresh log</button>}
          {sheet && !showForm && <button className={'tbtn' + (gridLines ? ' on' : '')} title="Show / hide Excel-style grid lines" onClick={() => setGridLines(g => { const nv = !g; try { localStorage.setItem('gf_gridlines', nv ? 'on' : 'off') } catch { /* noop */ } return nv })}>▦ Grid: {gridLines ? 'On' : 'Off'}</button>}
          {isAdmin && !asUser && sheet && !formView && <span className="sep" />}
          {canWrite && !showForm && <button className="tbtn primary" onClick={addRow}>+ New row</button>}
          {canWrite && !showForm && <button className="tbtn" onClick={addColumn}>▥ Add column</button>}
          {canWrite && !showForm && <><span className="sep" />
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
          <TbDrop label="➕ Insert ▾" open={menu === 'insert'} onToggle={() => setMenu(m => m === 'insert' ? null : 'insert')}>
            <button onClick={() => insertRow('above')}>Row above</button>
            <button onClick={() => insertRow('below')}>Row below</button>
            <button onClick={() => insertCol('left')}>Column left</button>
            <button onClick={() => insertCol('right')}>Column right</button>
          </TbDrop>
          {/* Delete menu */}
          <TbDrop label="🗑 Delete ▾" open={menu === 'delete'} onToggle={() => setMenu(m => m === 'delete' ? null : 'delete')}>
            <button onClick={deleteFocusedRow}>Delete row</button>
            <button onClick={deleteFocusedColumn}>Delete column</button>
          </TbDrop>
          {/* Format / cell type menu */}
          <TbDrop label="🔠 Type ▾" open={menu === 'format'} onToggle={() => setMenu(m => m === 'format' ? null : 'format')}>
            <button onClick={() => setColumnType('text')}>Text</button>
            <button onClick={() => setColumnType('number')}>Number (1,234)</button>
            <button onClick={() => setColumnType('currency')}>Currency (₹)</button>
            <button onClick={() => setColumnType('percent')}>Percent (%)</button>
            <button onClick={() => setColumnType('date')}>Date</button>
            <button onClick={() => setColumnType('checkbox')}>Checkbox ☑</button>
            <button onClick={() => setColumnType('select')}>Dropdown…</button>
          </TbDrop>
          <button className="tbtn" title="Find & Replace (Ctrl+H)" onClick={() => setShowFR(true)}>🔎 Find/Replace</button>
          <button className="tbtn icon" title="Undo (Ctrl+Z)" onClick={doUndo}>↶</button>
          <button className={'tbtn icon' + (wrap ? ' on' : '')} title="Wrap text in cells" onClick={() => setWrap(w => !w)}>↩</button>
          <button className="tbtn" title="Conditional colour rules (e.g. overdue = red)" onClick={() => setRulesDlg(true)}>🎯 Rules</button>
          <span className="sep" />
          <button className="tbtn" title="Download as CSV" onClick={exportCsv}>⬇ CSV</button>
          {sheet && <button className="tbtn primary" title="Share this sheet by email" onClick={() => setShowShare(true)}>🔗 Share</button>}</>}
          {isAdmin && !showForm && <><span className="sep" />
          <button className="tbtn" title="Import from Smartsheet" onClick={() => setShowImport(true)}>⬇ Import</button></>}
          <span className="spacer" />
          <input id="gf-search" className="search" placeholder="🔍 Search…" value={quick} onChange={e => setQuickFilter(e.target.value)} />
          {saved === 'saved' && <span className="saved-pill">Saved ✓</span>}
          <span className="count">{rows.length} rows</span>
        </div>

        {/* formula bar (Excel-style) — hidden in form-entry view */}
        {sheet && !showForm && (
          <div className="fxbar">
            <span className="fxcell">{fx.label || '—'}</span>
            <span className="fxsym">ƒx</span>
            <div className="fx-acwrap">
              <input ref={fxInputRef} className="fxinput" value={fx.value} disabled={!canWrite || !fx.key}
                placeholder={fx.key ? 'Type = then click cells to build a formula, e.g. =LOOKUP(…)' : 'Click a cell to edit…'}
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
                  else if (e.key === 'Escape') { e.target.blur() }
                }} />
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
            {(fx.value || '').trim().startsWith('=') && <span className="fxhint">📌 Click cells to add refs · ↑↓ pick · Enter to apply</span>}
          </div>
        )}

        {err && <div className="err" style={{ padding: '6px 12px' }}>{err}</div>}

        <div className={'grid-wrap' + (showForm ? '' : (theme === 'dark' ? ' ag-theme-quartz-dark' : ' ag-theme-quartz')) + (gridLines ? ' grid-lines' : ' grid-off')} onPaste={handlePaste}>
          {showForm ? (
            <FormEntry sheet={sheet} cols={cols} onSubmitted={() => { selectSheet(sheet); toast('Entry added ✓') }} />
          ) : sheet ? (
            <AgGridReact ref={gridRef} rowData={displayRows} columnDefs={colDefs} defaultColDef={defaultColDef}
              getRowId={getRowId}
              onCellValueChanged={onCellValueChanged} onCellClicked={onCellClicked}
              onCellEditingStarted={onCellEditingStarted}
              onCellContextMenu={onCellContextMenu}
              enterNavigatesVertically enterNavigatesVerticallyAfterEdit
              rowBuffer={20} enableCellTextSelection stopEditingWhenCellsLoseFocus />
          ) : loading ? (
            <div className="skel-wrap">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skel skel-row" />)}
            </div>
          ) : (
            <div className="onboard">
              <div className="onboard-mark"><Mark size={40} /></div>
              <h2>Welcome to smartsheet by Laser Power</h2>
              <p>Pick a sheet on the left to open it — or start something new.</p>
              <div className="onboard-actions">
                {canWrite && <button className="btn" onClick={newSheet}>＋ New sheet</button>}
                <button className="btn ghost" onClick={() => setShowImport(true)}>⬇ Import from Smartsheet</button>
              </div>
              <button className="onboard-help" onClick={() => setShowHelp(true)}>⌨ See keyboard shortcuts</button>
            </div>
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

      <Notifications open={showNotif} onClose={() => setShowNotif(false)} isApprover={isApprover && !asUser} onCount={setNotifCount} />

      <SearchModal open={showSearch} onClose={() => setShowSearch(false)}
        sheets={allSheets(tree)} recents={recents} onPick={(s) => { if (view === 'admin') setView('browse'); setFormView(true); selectSheet(s) }} />

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

      {/* right-click context menu */}
      {ctx && (
        <div className="ctx-menu" style={{ left: ctx.x, top: ctx.y }} onClick={e => e.stopPropagation()}>
          <button onClick={copyCell}>📋 Copy</button>
          <div className="ctx-sep" />
          <button onClick={() => { setCtx(null); insertRow('above') }}>⬆ Insert row above</button>
          <button onClick={() => { setCtx(null); insertRow('below') }}>⬇ Insert row below</button>
          <button onClick={() => { setCtx(null); deleteFocusedRow() }}>🗑 Delete row</button>
          <div className="ctx-sep" />
          <button onClick={() => { setCtx(null); insertCol('left') }}>⬅ Insert column left</button>
          <button onClick={() => { setCtx(null); insertCol('right') }}>➡ Insert column right</button>
          <button onClick={() => { setCtx(null); deleteFocusedColumn() }}>🗑 Delete column</button>
          <div className="ctx-sep" />
          <button onClick={() => { setCtx(null); applyFormat('b') }}><b>B</b>&nbsp; Bold</button>
          <button onClick={() => { setCtx(null); applyFormat('i') }}><i>I</i>&nbsp; Italic</button>
          <button onClick={() => { setCtx(null); applyFormat('u') }}><u>U</u>&nbsp; Underline</button>
        </div>
      )}

      {/* toasts */}
      <div className="toast-wrap">
        {toasts.map(t => <div key={t.id} className={'toast ' + (t.type === 'err' ? 'toast-err' : 'toast-ok')}>{t.msg}</div>)}
      </div>

      {/* column editor: rename / type / dropdown options */}
      {colDlg && (
        <SimpleModal title="Edit column" onClose={() => setColDlg(null)}>
          <label>Column name</label>
          <input className="fr-in" style={{ width: '100%' }} autoFocus value={colDlg.label}
            onChange={e => setColDlg(d => ({ ...d, label: e.target.value }))} />
          <label style={{ marginTop: 10 }}>Type</label>
          <select className="fr-in" style={{ width: '100%' }} value={colDlg.type}
            onChange={e => setColDlg(d => ({ ...d, type: e.target.value }))}>
            <option value="text">Text</option>
            <option value="number">Number (1,234)</option>
            <option value="currency">Currency (₹)</option>
            <option value="percent">Percent (%)</option>
            <option value="date">Date</option>
            <option value="checkbox">Checkbox</option>
            <option value="select">Dropdown</option>
          </select>
          {colDlg.type === 'select' && (
            <div style={{ marginTop: 10 }}>
              <label>Dropdown options</label>
              <div className="chips">
                {colDlg.options.map((o, i) => (
                  <span key={i} className="chip">{o}<button onClick={() => setColDlg(d => ({ ...d, options: d.options.filter((_, j) => j !== i) }))}>×</button></span>
                ))}
                {colDlg.options.length === 0 && <span className="chips-empty">No options yet</span>}
              </div>
              <input className="fr-in" style={{ width: '100%', marginTop: 6 }} placeholder="Type an option, press Enter to add"
                onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { const v = e.target.value.trim(); setColDlg(d => ({ ...d, options: [...d.options, v] })); e.target.value = '' } }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn ghost" onClick={() => setColDlg(null)}>Cancel</button>
            <button className="btn" onClick={saveColDlg}>Save</button>
          </div>
        </SimpleModal>
      )}

      {/* refresh log — who refreshed, when, how long */}
      {showRefreshLog && (
        <SimpleModal title={`Refresh log — ${sheet?.name || ''}`} onClose={() => setShowRefreshLog(false)}>
          <p className="dlg-note">Refreshes for <b>this sheet only</b> — who did it, the date &amp; time, and how long it took.</p>
          <div className="rlog-wrap">
            <table className="admin-table rlog-table">
              <thead><tr><th>Who</th><th>Date &amp; time</th><th>What</th><th style={{ textAlign: 'right' }}>Time taken</th></tr></thead>
              <tbody>
                {refreshLogs.length === 0 && <tr><td colSpan={4} className="admin-empty">No refreshes recorded for this sheet yet.</td></tr>}
                {refreshLogs.map(r => (
                  <tr key={r.id}>
                    <td>{r.user_name || r.user_email || 'Someone'}</td>
                    <td>{fmtDateTime(r.created_at)}</td>
                    <td>{r.scope === 'column' ? (r.column_label || 'Column') : 'Whole sheet'}</td>
                    <td style={{ textAlign: 'right' }}>{fmtDuration(r.duration_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn ghost" onClick={loadRefreshLogs}>↻ Reload</button>
            <button className="btn" onClick={() => setShowRefreshLog(false)}>Close</button>
          </div>
        </SimpleModal>
      )}

      {/* conditional colour rules */}
      {rulesDlg && (
        <SimpleModal title="Conditional colour rules" onClose={() => setRulesDlg(false)}>
          <p className="dlg-note">Colour cells automatically when they match a condition — e.g. Status contains "overdue" → red.</p>
          {rules.length === 0 && <div className="dlg-empty">No rules yet.</div>}
          {rules.map((r, i) => (
            <div key={i} className="rule-row">
              <span className="rule-chip" style={{ background: r.bg || undefined, color: r.color || undefined }}>
                {(cols.find(c => c.key === r.colKey)?.label || r.colKey)} {OP_LABEL[r.op] || r.op} {r.op !== 'empty' ? r.value : ''}
              </span>
              <button className="share-x" onClick={() => saveRules(rules.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <RuleAdder cols={cols} onAdd={(r) => saveRules([...rules, r])} />
        </SimpleModal>
      )}

      {/* keyboard shortcuts help */}
      {showHelp && (
        <SimpleModal title="Keyboard shortcuts & tips" onClose={() => setShowHelp(false)}>
          <div className="shortcuts">
            <div><span className="sc-keys"><kbd>Ctrl</kbd>+<kbd>Z</kbd></span><span>Undo</span></div>
            <div><span className="sc-keys"><kbd>Ctrl</kbd>+<kbd>B</kbd>/<kbd>I</kbd>/<kbd>U</kbd></span><span>Bold / Italic / Underline</span></div>
            <div><span className="sc-keys"><kbd>Ctrl</kbd>+<kbd>F</kbd></span><span>Search this sheet</span></div>
            <div><span className="sc-keys"><kbd>Ctrl</kbd>+<kbd>H</kbd></span><span>Find &amp; Replace</span></div>
            <div><span className="sc-keys"><kbd>Enter</kbd></span><span>Move down / commit a formula</span></div>
            <div><span className="sc-keys"><kbd>Right-click</kbd></span><span>Cell menu — insert, delete, format</span></div>
            <div><span className="sc-keys"><kbd>Double-click</kbd></span><span>Column header → rename &amp; set type</span></div>
            <div><span className="sc-keys"><kbd>=</kbd></span><span>Start a formula (SUM, IF, VLOOKUP…)</span></div>
            <div><span className="sc-keys"><kbd>F1</kbd></span><span>Open this help</span></div>
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
