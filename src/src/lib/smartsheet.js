// Smartsheet API client (browser). User pastes their API token.
// Docs: https://smartsheet.redoc.ly/
const BASE = 'https://api.smartsheet.com/2.0'

async function api(token, path) {
  const res = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + token } })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Smartsheet API ${res.status}: ${t.slice(0, 200)}`)
  }
  return res.json()
}

// List all sheets the token can access
export async function listSheets(token) {
  const data = await api(token, '/sheets?includeAll=true')
  return (data.data || []).map(s => ({ id: s.id, name: s.name, modifiedAt: s.modifiedAt }))
}

// Fetch a full sheet (columns + rows)
export async function getSheet(token, sheetId) {
  return api(token, `/sheets/${sheetId}`)
}

// Map a Smartsheet column type to our column type
function mapType(col) {
  const t = (col.type || '').toUpperCase()
  if (t === 'PICKLIST' || t === 'MULTI_PICKLIST') {
    const title = (col.title || '').toLowerCase()
    if (title.includes('status')) return 'status'
    if (title.includes('priority')) return 'priority'
    return 'select'
  }
  if (t === 'DATE' || t === 'DATETIME' || t === 'ABSTRACT_DATETIME') return 'date'
  if (t === 'CHECKBOX') return 'checkbox'
  if (t === 'CONTACT_LIST') return 'text'
  return 'text'
}

// Convert a Smartsheet sheet payload into our {columns, rows} shape
export function transform(sheetPayload) {
  const cols = (sheetPayload.columns || []).map((c, i) => ({
    key: 'c_' + c.id,
    label: c.title || ('Column ' + (i + 1)),
    type: mapType(c),
    options: c.options || null,
    position: i + 1,
  }))
  const byId = {}
  ;(sheetPayload.columns || []).forEach(c => { byId[c.id] = 'c_' + c.id })
  const rows = (sheetPayload.rows || []).map(r => {
    const data = {}
    ;(r.cells || []).forEach(cell => {
      const key = byId[cell.columnId]
      if (key) data[key] = cell.displayValue ?? cell.value ?? ''
    })
    return { data, source_system: 'smartsheet', source_id: String(r.id) }
  })
  return { name: sheetPayload.name, columns: cols, rows }
}
