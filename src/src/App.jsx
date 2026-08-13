import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { supabase } from './lib/supabase'
import { PillRenderer, inr } from './lib/cells.jsx'
import Login from './components/Login.jsx'
import Tree from './components/Tree.jsx'
import ImportModal from './components/ImportModal.jsx'
import IconRail from './components/IconRail.jsx'

function Logo() {
  return <div className="logo"><span className="sq"><i/><i/><i/><i/></span> GridFlow</div>
}

function Workspace() {
  const { profile, role, signOut, canWrite } = useAuth()
  const [tree, setTree] = useState([])
  const [firstWsId, setFirstWsId] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [cols, setCols] = useState([])
  const [rows, setRows] = useState([])
  const [quick, setQuick] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [view, setView] = useState('browse')   // home | search | browse
  const gridRef = useRef()

  const focusSearch = () => { setView('browse'); setTimeout(() => document.getElementById('gf-search')?.focus(), 50) }
  const initials = (profile?.full_name || profile?.email || 'U').trim().slice(0, 2).toUpperCase()

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
  useEffect(() => { loadTree() }, []) // eslint-disable-line

  async function selectSheet(s) {
    setSheet(s); setLoading(true); setErr('')
    const { data: c } = await supabase.from('sheet_columns').select('*').eq('sheet_id', s.id).order('position')
    setCols(c || [])
    const { data: r, error } = await supabase.from('rows').select('*').eq('sheet_id', s.id).order('created_at').limit(5000)
    if (error) setErr(error.message)
    setRows(r || []); setLoading(false)
  }

  const isWO = sheet?.kind === 'work_orders'

  // AG Grid columns from configurable columns + lifecycle
  const colDefs = useMemo(() => {
    const defs = []
    if (isWO) {
      defs.push(
        { headerName: 'Status', field: 'status', width: 130, cellRenderer: PillRenderer,
          editable: canWrite, cellEditor: 'agSelectCellEditor',
          cellEditorParams: { values: ['open','assigned','in_progress','on_hold','resolved','closed','reopened'] } },
        { headerName: 'Priority', field: 'priority', width: 120, cellRenderer: PillRenderer,
          editable: canWrite, cellEditor: 'agSelectCellEditor',
          cellEditorParams: { values: ['low','medium','high','critical'] } },
      )
    }
    cols.forEach(c => {
      defs.push({
        headerName: c.label, field: 'data.' + c.key,
        valueGetter: p => p.data?.data?.[c.key],
        valueSetter: p => { if (!p.data.data) p.data.data = {}; p.data.data[c.key] = p.newValue; return true },
        editable: canWrite,
        minWidth: 130, flex: 1,
        cellRenderer: (c.type === 'status' || c.type === 'priority') ? PillRenderer : undefined,
        valueFormatter: c.type === 'currency' ? inr : undefined,
        cellEditor: (c.type === 'select' || c.type === 'status' || c.type === 'priority') ? 'agSelectCellEditor' : undefined,
        cellEditorParams: c.options ? { values: c.options } : undefined,
      })
    })
    return defs
  }, [cols, isWO, canWrite])

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true, filter: true, minWidth: 110 }), [])

  // inline edit → save to Supabase
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
    if (!firstWsId) { setErr('No workspace found. Run the schema first.'); return }
    const name = prompt('New sheet name?', 'New Sheet')
    if (!name) return
    const { data, error } = await supabase.from('sheets')
      .insert({ workspace_id: firstWsId, name, kind: 'grid' }).select().single()
    if (error) return setErr(error.message)
    // give it a couple of starter columns
    await supabase.from('sheet_columns').insert([
      { sheet_id: data.id, key: 'title', label: 'Title', type: 'text', position: 1 },
      { sheet_id: data.id, key: 'status', label: 'Status', type: 'status', options: ['open','in_progress','done'], position: 2 },
    ])
    loadTree(data.id)
  }

  async function addColumn() {
    if (!sheet) return
    const label = prompt('New column name?')
    if (!label) return
    const key = 'c_' + Math.random().toString(36).slice(2, 8)
    const { error } = await supabase.from('sheet_columns')
      .insert({ sheet_id: sheet.id, key, label, type: 'text', position: cols.length + 1 })
    if (error) return setErr(error.message)
    selectSheet(sheet)
  }

  return (
    <div className="shell">
      <div className="topnav">
        <Logo />
        <div className="spacer" />
        <span className="who">{profile?.full_name || profile?.email} · {role.replace(/_/g, ' ')}</span>
        <button className="out" onClick={signOut}>Sign out</button>
      </div>

      <IconRail
        view={view}
        onView={(v) => { if (v === 'search') focusSearch(); else setView(v) }}
        onCreate={newSheet}
        initials={initials}
      />

      <Tree tree={tree} activeSheet={sheet} onSelect={selectSheet} onNewSheet={newSheet} />

      <div className="work">
        <div className="toolbar">
          <span className="title">{sheet ? sheet.name : 'No sheet'}</span>
          <span className="sep" />
          {canWrite && <button className="tbtn primary" onClick={addRow}>➕ New row</button>}
          {canWrite && <button className="tbtn" onClick={addColumn}>▥ Add column</button>}
          <button className="tbtn" onClick={() => setShowImport(true)}>⬇ Import from Smartsheet</button>
          <span className="spacer" />
          <input id="gf-search" className="search" placeholder="🔍 Search rows…" value={quick}
            onChange={e => { setQuick(e.target.value); gridRef.current?.api.setGridOption('quickFilterText', e.target.value) }} />
          <span className="count">{rows.length} rows</span>
        </div>

        {err && <div className="err" style={{ padding: '6px 12px' }}>{err}</div>}

        <div className="grid-wrap ag-theme-quartz">
          {sheet ? (
            <AgGridReact
              ref={gridRef}
              rowData={rows}
              columnDefs={colDefs}
              defaultColDef={defaultColDef}
              onCellValueChanged={onCellValueChanged}
              animateRows
              enableCellTextSelection
              stopEditingWhenCellsLoseFocus
            />
          ) : (
            <div className="empty">{loading ? 'Loading…' : 'Select a sheet on the left, or Import from Smartsheet.'}</div>
          )}
        </div>
      </div>

      {showImport && (
        <ImportModal
          workspaceId={firstWsId}
          onClose={() => setShowImport(false)}
          onDone={(s) => { setShowImport(false); loadTree(s.id) }}
        />
      )}
    </div>
  )
}

function Gate() {
  const { session, loading } = useAuth()
  if (loading) return <div className="center">Loading…</div>
  if (!session) return <Login />
  return <Workspace />
}

export default function App() {
  return <AuthProvider><Gate /></AuthProvider>
}
