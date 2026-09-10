import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import SimpleModal from './SimpleModal.jsx'

// Import rows from an Excel (.xlsx/.xls) or CSV file into the current sheet.
// The user picks a file, we read the header row, auto-map each file column to a
// matching sheet column (by label, case-insensitive), let them adjust the mapping,
// then bulk-insert the rows.
export default function FileImportModal({ sheet, cols, onClose, onDone }) {
  const [rows, setRows] = useState(null)     // parsed data rows (array of objects keyed by file header)
  const [headers, setHeaders] = useState([]) // file header names
  const [map, setMap] = useState({})         // { fileHeader: sheetColKey | '' }
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const inputRef = useRef(null)

  const norm = (s) => String(s || '').trim().toLowerCase()

  function readFile(file) {
    if (!file) return
    setFileName(file.name); setMsg('')
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!json.length) { setMsg('That file has no data rows.'); return }
        const hdrs = Object.keys(json[0])
        setHeaders(hdrs)
        setRows(json)
        // auto-map: file header -> sheet col whose label matches
        const auto = {}
        hdrs.forEach(h => {
          const hit = cols.find(c => norm(c.label) === norm(h))
          auto[h] = hit ? hit.key : ''
        })
        setMap(auto)
      } catch (err) {
        setMsg('Could not read that file. Make sure it is a valid .xlsx or .csv. (' + err.message + ')')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const mappedCount = Object.values(map).filter(Boolean).length

  async function doImport() {
    if (!rows) return
    setBusy(true); setMsg('')
    const payload = rows.map(r => {
      const data = {}
      headers.forEach(h => {
        const colKey = map[h]
        if (colKey) data[colKey] = r[h]
      })
      return { sheet_id: sheet.id, data, source_system: 'import' }
    }).filter(p => Object.keys(p.data).length)  // skip fully-empty rows

    if (!payload.length) { setBusy(false); setMsg('No columns are mapped, so there is nothing to import. Map at least one column.'); return }

    // insert in chunks so large files don't hit request limits
    const CHUNK = 500
    let done = 0
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK)
      const { error } = await supabase.from('rows').insert(slice)
      if (error) { setBusy(false); setMsg('Error: ' + error.message); return }
      done += slice.length
      setMsg(`Importing… ${done}/${payload.length}`)
    }
    setBusy(false)
    onDone && onDone(done)
  }

  return (
    <SimpleModal title="⬇ Import from Excel / CSV" onClose={onClose}>
      <div className="fi-modal">
        {!rows && (
          <div className="fi-drop" onClick={() => inputRef.current?.click()}>
            <div className="fi-drop-ic">📄</div>
            <div className="fi-drop-t">Click to choose a file</div>
            <div className="fi-drop-s">Excel (.xlsx, .xls) or CSV. First row should be the column names.</div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={e => readFile(e.target.files?.[0])} />
          </div>
        )}

        {rows && (
          <>
            <p className="fi-info"><b>{fileName}</b> — {rows.length} rows found. Match each file column to a sheet column below. Columns set to <i>“Don’t import”</i> are skipped.</p>
            <div className="fi-maplist">
              <div className="fi-maphead"><span>File column</span><span>→ Sheet column</span></div>
              {headers.map(h => (
                <div className="fi-maprow" key={h}>
                  <span className="fi-fcol">{h}</span>
                  <select value={map[h] || ''} onChange={e => setMap(m => ({ ...m, [h]: e.target.value }))}>
                    <option value="">— Don’t import —</option>
                    {cols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {msg && <div className={'fi-msg' + (msg.startsWith('Error') ? ' err' : '')}>{msg}</div>}
            <div className="fi-foot">
              <span className="fi-count">{mappedCount} of {headers.length} columns mapped</span>
              <div>
                <button className="btn ghost" onClick={() => { setRows(null); setHeaders([]); setMap({}); setFileName('') }} disabled={busy}>Choose another</button>
                <button className="btn" onClick={doImport} disabled={busy || !mappedCount}>{busy ? 'Importing…' : `Import ${rows.length} rows`}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </SimpleModal>
  )
}
