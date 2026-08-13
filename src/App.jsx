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
  const gridRef = useRef()

  const initials = (profile?.full_name || profile?.email || 'U').trim().slice(0, 2).toUpperCase()
  const focusSearch = () => document.getElementById('gf-search')?.focus()

  // Briefly show the loader (min duration so the animation reads as intentional).
  function flash(label, ms = 650) {
    setBusyLabel(label || ''); setBusy(true)
    window.clearTimeout(flash._t)
    flash._t = window.setTimeout(() => setBusy(false), ms)
  }
  // Loader on view (rail) change.
  function changeView(v) {
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
        editable: canWrite, minWidth: 130, flex: 1, cellClass: cc,
        cellRenderer: (c.type === 'status' || c.type === 'priority') ? PillRenderer : undefined,
        valueFormatter: c.type === 'currency' ? inr : undefined,
        cellEditor: (c.type === 'select' || c.type === 'status' || c.type === 'priority') ? 'agSelectCellEditor' : undefined,
        cellEditorParams: c.options ? { values: c.options } : undefined,
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
  async function newSheet() {
    if (!firstWsId) return setErr('No workspace found. Run the schema first.')
    const name = prompt('New sheet name?', 'New Sheet'); if (!name) return
    const { data, error } = await supabase.from('sheets').insert({ workspace_id: firstWsId, name, kind: 'grid' }).select().single()
    if (error) return setErr(error.message)
    await supabase.from('sheet_columns').insert([
      { sheet_id: data.id, key: 'title', label: 'Title', type: 'text', position: 1 },
      { sheet_id: data.id, key: 'status', label: 'Status', type: 'status', options: ['open','in_progress','done'], position: 2 },
    ])
    loadTree(data.id)
  }
  async function addColumn() {
    if (!sheet) return
    const label = prompt('New column name?'); if (!label) return
    const key = 'c_' + Math.random().toString(36).slice(2, 8)
    const { error } = await supabase.from('sheet_columns').insert({ sheet_id: sheet.id, key, label, type: 'text', position: cols.length + 1 })
    if (error) return setErr(error.message)
    selectSheet(sheet)
  }

  const setQuickFilter = (v) => { setQuick(v); gridRef.current?.api.setGridOption('quickFilterText', v) }

  return (
    <div className={'shell' + (view === 'admin' ? ' admin-mode' : '')}>
      <IconRail view={view} onView={changeView} onCreate={newSheet} onSearch={focusSearch}
        onNotif={() => setShowNotif(v => !v)} notifCount={notifCount} initials={initials} isAdmin={isAdmin} />

      {view === 'admin' ? (
        <AdminPanel />
      ) : (
      <>
      {/* tree */}
      <div className="tree">
        <div className="head"><span>Sheets</span><button title="New sheet" onClick={newSheet}>+</button></div>
        {tree.length === 0 && <div className="empty" style={{ padding: '20px 14px', fontSize: 12 }}>No sheets yet.</div>}
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
                      <button key={s.id} className={'node sheet' + (sheet && sheet.id === s.id ? ' active' : '')} onClick={() => selectSheet(s)}>
                        <span className="ico">▦</span>{s.name}
                      </button>
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
            <svg width="16" height="16" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="5" fill="#fff"/><path d="M6 12.5l3.5 3.5L18 7.5" stroke="#2f5bd6" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {sheet ? sheet.name : 'smartsheet'}
          </span>
          <span className="who">{profile?.full_name || profile?.email}</span>
          <button className="out" onClick={signOut}>Sign out</button>
        </div>

        {/* grid toolbar */}
        <div className="toolbar">
          {canWrite && <button className="tbtn primary" onClick={addRow}>+ New row</button>}
          {canWrite && <button className="tbtn" onClick={addColumn}>▥ Add column</button>}
          <span className="sep" />
          <button className="tbtn icon" title="Bold"><b>B</b></button>
          <button className="tbtn icon" title="Italic"><i>I</i></button>
          <button className="tbtn icon" title="Underline"><u>U</u></button>
          <button className="tbtn icon" title="Fill color">🎨</button>
          <span className="sep" />
          <button className="tbtn" title="Filter">⛃ Filter</button>
          <button className="tbtn" title="Sort">↕ Sort</button>
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
