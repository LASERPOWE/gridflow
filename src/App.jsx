import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { supabase } from './lib/supabase'
import { PillRenderer, inr } from './lib/cells.jsx'
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
  const [recents, setRecents] = useState([])  // recently opened sheets
  const gridRef = useRef()

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
    const { data: r, error } = await supabase.from('rows').select('*').eq('sheet_id', s.id).order('created_at').limit(5000)
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
    cols.forEach(c => {
      const cc = colorClass(c.key, c.label)
      defs.push({
        headerName: c.label, field: 'data.' + c.key,
        valueGetter: p => p.data?.data?.[c.key],
        valueSetter: p => { if (!p.data.data) p.data.data = {}; p.data.data[c.key] = p.newValue; return true },
        editable: canWrite, minWidth: 110, flex: 1, cellClass: cc,
        cellRenderer: (c.type === 'status' || c.type === 'priority') ? PillRenderer : undefined,
        valueFormatter: c.type === 'currency' ? inr : undefined,
        cellEditor: (c.type === 'select' || c.type === 'status' || c.type === 'priority') ? 'agSelectCellEditor' : undefined,
        cellEditorParams: c.options ? { values: c.options } : undefined,
        // per-cell Excel formatting stored in row.data._fmt[key]
        cellStyle: p => {
          const f = p.data?.data?._fmt?.[c.key]; if (!f) return null
          return {
            fontWeight: f.b ? '700' : undefined,
            fontStyle: f.i ? 'italic' : undefined,
            textDecoration: f.u ? 'underline' : undefined,
            backgroundColor: f.bg || undefined,
          }
        },
      })
    })
    return defs
  }, [cols, isWO, canWrite])

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true, filter: true, minWidth: 110 }), [])

  const onCellValueChanged = useCallback(async (e) => {
    const patch = e.colDef.field === 'status' ? { status: e.newValue }
      : e.colDef.field === 'priority' ? { priority: e.newValue }
      : { data: e.data.data }
    const { error } = await supabase.from('rows').update(patch).eq('id', e.data.id)
    if (error) setErr(error.message)
  }, [])

  async function addRow() {
    if (!sheet) return
    const { data, error } = await supabase.from('rows')
      .insert({ sheet_id: sheet.id, data: {}, status: isWO ? 'open' : null, priority: isWO ? 'medium' : null, source_system: 'manual' })
      .select().single()
    if (error) return setErr(error.message)
    setRows(r => [...r, data])
  }
  // New sheet = blank Excel grid: columns A–J and 20 empty rows.
  async function newSheet() {
    if (!firstWsId) return setErr('No workspace found. Run the schema first.')
    const name = prompt('New sheet name?', 'Sheet1'); if (!name) return
    const { data, error } = await supabase.from('sheets').insert({ workspace_id: firstWsId, name, kind: 'grid' }).select().single()
    if (error) return setErr(error.message)
    const colRows = []
    for (let i = 0; i < 10; i++) colRows.push({ sheet_id: data.id, key: 'col_' + colLetter(i).toLowerCase(), label: colLetter(i), type: 'text', position: i + 1 })
    await supabase.from('sheet_columns').insert(colRows)
    const blankRows = []
    for (let i = 0; i < 20; i++) blankRows.push({ sheet_id: data.id, data: {}, source_system: 'manual' })
    await supabase.from('rows').insert(blankRows)
    loadTree(data.id)
  }
  async function addColumn() {
    if (!sheet) return
    const key = 'col_' + colLetter(cols.length).toLowerCase()
    const label = colLetter(cols.length)
    const { error } = await supabase.from('sheet_columns').insert({ sheet_id: sheet.id, key, label, type: 'text', position: cols.length + 1 })
    if (error) return setErr(error.message)
    selectSheet(sheet)
  }
  async function renameSheet(s) {
    const name = prompt('Rename sheet', s.name); if (!name || name === s.name) return
    const { error } = await supabase.from('sheets').update({ name }).eq('id', s.id)
    if (error) return setErr(error.message)
    loadTree(s.id)
  }
  async function deleteSheet(s) {
    if (!confirm('Delete sheet "' + s.name + '" and all its data? This cannot be undone.')) return
    await supabase.from('rows').delete().eq('sheet_id', s.id)
    await supabase.from('sheet_columns').delete().eq('sheet_id', s.id)
    const { error } = await supabase.from('sheets').delete().eq('id', s.id)
    if (error) return setErr(error.message)
    if (sheet?.id === s.id) setSheet(null)
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
    else f[kind] = !f[kind]
    row.data._fmt[key] = f
    await supabase.from('rows').update({ data: row.data }).eq('id', row.id)
    api.refreshCells({ rowNodes: [node], force: true })
  }

  const setQuickFilter = (v) => { setQuick(v); gridRef.current?.api.setGridOption('quickFilterText', v) }

  return (
    <div className={'shell' + (view === 'admin' ? ' admin-mode' : '')}>
      <IconRail view={view} onView={changeView} onCreate={newSheet} onSearch={openSearch}
        onNotif={() => setShowNotif(v => !v)} notifCount={notifCount} initials={initials} isAdmin={isAdmin}
        onProfile={() => setShowProfile(v => !v)} />

      {view === 'admin' ? (
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
                            <button title="Delete" onClick={() => deleteSheet(s)}>🗑</button>
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
          <button className="tbtn icon" title="Clear fill" onClick={() => applyFormat('bg', '')}>⊘</button></>}
          <span className="sep" />
          <button className="tbtn" onClick={() => setShowImport(true)}>⬇ Import from Smartsheet</button>
          {sheet && !canWrite && <button className="tbtn" onClick={() => setShowReq(true)}>🔒 Request access</button>}
          <span className="spacer" />
          <input id="gf-search" className="search" placeholder="🔍 Search…" value={quick} onChange={e => setQuickFilter(e.target.value)} />
          <span className="count">{rows.length} rows</span>
        </div>

        {err && <div className="err" style={{ padding: '6px 12px' }}>{err}</div>}

        <div className="grid-wrap ag-theme-quartz">
          {sheet ? (
            <AgGridReact ref={gridRef} rowData={rows} columnDefs={colDefs} defaultColDef={defaultColDef}
              onCellValueChanged={onCellValueChanged} animateRows enableCellTextSelection stopEditingWhenCellsLoseFocus />
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

      <Notifications open={showNotif} onClose={() => setShowNotif(false)} isApprover={isApprover} onCount={setNotifCount} />

      <SearchModal open={showSearch} onClose={() => setShowSearch(false)}
        sheets={allSheets(tree)} recents={recents} onPick={(s) => { if (view === 'admin') setView('browse'); selectSheet(s) }} />

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
