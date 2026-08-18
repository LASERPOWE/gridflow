// Smartsheet API client + transformer.
// Calls go through our own /api/smartsheet proxy (avoids browser CORS and keeps
// the token out of third-party requests). The user pastes their Smartsheet API
// token; the proxy forwards it as a Bearer header.
//
// What this imports (Phase 1–3):
//   • cell values  • columns + types  • dropdown options
//   • formulas (converted to gridflow A1 syntax where safe, value kept otherwise)
//   • formatting (bold/italic/underline, align, text + fill colour)

const PROXY = '/api/smartsheet'

async function api(token, path) {
  const res = await fetch(PROXY + '?path=' + encodeURIComponent(path), {
    headers: { 'x-ss-token': token },
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    let msg = t
    try { msg = JSON.parse(t).message || JSON.parse(t).error || t } catch {}
    throw new Error(`Smartsheet ${res.status}: ${String(msg).slice(0, 200)}`)
  }
  return res.json()
}

// List all sheets the token can access.
export async function listSheets(token) {
  const data = await api(token, '/sheets?includeAll=true')
  return (data.data || []).map(s => ({ id: s.id, name: s.name, modifiedAt: s.modifiedAt }))
}

// Fetch a full sheet (columns + rows + formats), plus the colour palette so we
// can translate formatting indices to hex.
export async function getSheet(token, sheetId) {
  const [sheet, palette] = await Promise.all([
    api(token, `/sheets/${sheetId}?include=format,objectValue`),
    colorPalette(token),
  ])
  sheet.__palette = palette
  return sheet
}

let _palette = null
async function colorPalette(token) {
  if (_palette) return _palette
  try {
    const si = await api(token, '/serverinfo')
    _palette = (si && si.formats && si.formats.color) || []
  } catch { _palette = [] }
  return _palette
}

// ---- helpers ---------------------------------------------------------------

// 0 -> A, 25 -> Z, 26 -> AA … (matches App.jsx colLetter exactly).
function colLetter(n) {
  let s = ''
  n = n + 1
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s
}

// Functions our formula engine (src/lib/formula.js) supports. A converted
// formula is only kept live if EVERY function it uses is in this set; otherwise
// we fall back to the computed value so nothing ever breaks.
const SUPPORTED = new Set([
  'SUM', 'PRODUCT', 'AVERAGE', 'AVG', 'MEDIAN', 'MIN', 'MAX', 'COUNT', 'COUNTA',
  'COUNTIF', 'SUMIF', 'AVERAGEIF', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'INT', 'ABS',
  'SQRT', 'POWER', 'MOD', 'IF', 'IFERROR', 'AND', 'OR', 'NOT', 'CONCAT',
  'CONCATENATE', 'LEN', 'LEFT', 'RIGHT', 'MID', 'UPPER', 'LOWER', 'TRIM',
  'LOOKUP', 'VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH',
])

// Convert a Smartsheet formula to gridflow (Excel/A1) syntax.
// Returns the converted "=…" string, or null if it can't be safely converted.
function convertFormula(f, titleToLetter, rowNumber) {
  if (!f || typeof f !== 'string') return null
  let s = f
  if (s.includes('{')) return null                 // cross-sheet reference — skip
  // [Column Title]@row  ->  <letter><thisRowNumber>
  s = s.replace(/\[([^\]]+)\]@row/g, (m, title) => {
    const L = titleToLetter[title]; return L ? L + rowNumber : m
  })
  // [Column Title]12    ->  <letter>12  (absolute row)
  s = s.replace(/\[([^\]]+)\](\d+)/g, (m, title, n) => {
    const L = titleToLetter[title]; return L ? L + n : m
  })
  if (/\[[^\]]+\]/.test(s)) return null            // an unresolved [ref] remains
  // every function used must be supported by our engine
  const fns = [...s.matchAll(/([A-Za-z_]+)\s*\(/g)].map(x => x[1].toUpperCase())
  if (!fns.every(fn => SUPPORTED.has(fn))) return null
  return s
}

// Map a Smartsheet column to a gridflow column type.
function mapType(col, sampleValues) {
  const t = (col.type || '').toUpperCase()
  if (t === 'PICKLIST' || t === 'MULTI_PICKLIST') return 'select'
  if (t === 'DATE' || t === 'DATETIME' || t === 'ABSTRACT_DATETIME') return 'date'
  if (t === 'CHECKBOX') return 'checkbox'
  if (t === 'CONTACT_LIST' || t === 'MULTI_CONTACT_LIST') return 'text'
  if (t === 'DURATION' || t === 'PREDECESSOR') return 'text'
  // TEXT_NUMBER (and anything else): sniff the values for money / % / number.
  return detectNumericType(sampleValues) || 'text'
}

function detectNumericType(values) {
  const ne = (values || []).filter(v => v != null && v !== '')
  if (!ne.length) return null
  let cur = 0, pct = 0, num = 0
  for (const v of ne) {
    const s = String(v).trim()
    if (/^[₹$€£]\s?-?[\d,]+(\.\d+)?$/.test(s)) cur++
    else if (/^-?\d+(\.\d+)?\s?%$/.test(s)) pct++
    else if (/^-?[\d,]+(\.\d+)?$/.test(s)) num++
  }
  const n = ne.length
  if (cur / n > 0.6) return 'currency'
  if (pct / n > 0.6) return 'percent'
  if (num / n > 0.8) return 'number'
  return null
}

// Smartsheet format descriptor -> gridflow per-cell style {b,i,u,align,text,fill}.
// Descriptor is a comma-separated index list; positions per Smartsheet docs:
// 0 font,1 size,2 bold,3 italic,4 underline,5 strike,6 hAlign,7 vAlign,
// 8 textColor,9 background,…  Colours index into the /serverinfo colour table.
function mapFormat(formatStr, palette) {
  if (!formatStr) return null
  const p = String(formatStr).split(',')
  const f = {}
  if (p[2] === '1') f.b = true
  if (p[3] === '1') f.i = true
  if (p[4] === '1') f.u = true
  if (p[6] === '1') f.align = 'left'
  else if (p[6] === '2') f.align = 'center'
  else if (p[6] === '3') f.align = 'right'
  const tc = p[8], bc = p[9]
  if (tc && palette[+tc] && isHex(palette[+tc])) f.text = palette[+tc]
  if (bc && palette[+bc] && isHex(palette[+bc])) f.fill = palette[+bc]
  return Object.keys(f).length ? f : null
}
const isHex = (v) => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)

// Coerce a cell's stored value based on the resolved column type.
function coerceValue(cell, type) {
  const raw = cell.value
  if (type === 'checkbox') return raw === true || raw === 'true' || raw === 1
  if (type === 'currency' || type === 'number') {
    const n = Number(raw); return isNaN(n) ? (cell.displayValue ?? '') : n
  }
  if (type === 'percent') {
    const n = Number(raw); return isNaN(n) ? (cell.displayValue ?? '') : n * 100
  }
  if (type === 'date') return raw ?? cell.displayValue ?? ''
  // text / select / contact
  return cell.displayValue ?? raw ?? ''
}

// ---- main transform --------------------------------------------------------

// Convert a Smartsheet sheet payload into { name, columns, rows } ready to
// insert into our sheets / sheet_columns / rows tables.
export function transform(sheetPayload) {
  const palette = sheetPayload.__palette || []
  const ssCols = sheetPayload.columns || []
  const ssRows = sheetPayload.rows || []

  // sample values per column (for numeric type sniffing)
  const samples = {}
  ssCols.forEach(c => { samples[c.id] = [] })
  ssRows.slice(0, 50).forEach(r => (r.cells || []).forEach(cell => {
    if (samples[cell.columnId]) samples[cell.columnId].push(cell.displayValue ?? cell.value)
  }))

  const columns = ssCols.map((c, i) => ({
    key: 'c_' + c.id,
    label: c.title || ('Column ' + (i + 1)),
    type: mapType(c, samples[c.id]),
    options: (c.options && c.options.length) ? c.options : null,
    position: i + 1,
  }))

  const keyById = {}
  const typeById = {}
  const titleToLetter = {}
  ssCols.forEach((c, i) => {
    keyById[c.id] = 'c_' + c.id
    typeById[c.id] = columns[i].type
    if (c.title) titleToLetter[c.title] = colLetter(i)
  })

  const rows = ssRows.map((r, ri) => {
    const rowNumber = r.rowNumber || (ri + 1)
    const data = {}
    const fmt = {}
    ;(r.cells || []).forEach(cell => {
      const key = keyById[cell.columnId]; if (!key) return
      const type = typeById[cell.columnId]
      // 1) formula (converted) takes priority, else the value
      let stored = null
      if (cell.formula) stored = convertFormula(cell.formula, titleToLetter, rowNumber)
      if (stored == null) stored = coerceValue(cell, type)
      data[key] = stored
      // 2) formatting
      const cf = mapFormat(cell.format, palette)
      if (cf) fmt[key] = cf
    })
    if (Object.keys(fmt).length) data._fmt = fmt
    return { data, source_system: 'smartsheet' }
  })

  return { name: sheetPayload.name, columns, rows }
}
