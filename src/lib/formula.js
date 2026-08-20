// Excel-style formula engine (recursive-descent parser) with 2D ranges.
// Supports numbers, strings, booleans, cell refs (A1), ranges (A1:B5),
// operators + - * / ^ and comparisons =, <>, <, >, <=, >=, parentheses,
// nesting, and a broad set of functions incl. lookup family.
// resolve(colIdx, rowIdx) -> raw value of a cell (0-based indexes).

export function isFormula(v) {
  return typeof v === 'string' && v.trim().startsWith('=')
}

function colToIndex(s) {
  let n = 0
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64)
  return n - 1
}

// A range is { _grid: [[cell,...rowcells], ...] } (row-major 2D).
function isRange(v) { return v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v._grid) }
function cells1D(v) {
  if (isRange(v)) { const o = []; for (const row of v._grid) for (const c of row) o.push(c); return o }
  if (Array.isArray(v)) return v
  return [v]
}

// ---- value coercion ----
function toNum(v) {
  if (isRange(v)) return toNum(cells1D(v)[0])
  if (Array.isArray(v)) return toNum(v.length ? v[0] : 0)
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v === '' || v === null || v === undefined) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}
function toStr(v) {
  if (isRange(v)) return cells1D(v).map(toStr).join('')
  if (Array.isArray(v)) return v.map(toStr).join('')
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (v === null || v === undefined) return ''
  return String(v)
}
function toBool(v) {
  if (isRange(v)) return toBool(cells1D(v)[0])
  if (Array.isArray(v)) return toBool(v.length ? v[0] : false)
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = String(v).trim().toUpperCase()
  if (s === 'TRUE') return true
  if (s === 'FALSE' || s === '') return false
  const n = parseFloat(s)
  return isNaN(n) ? Boolean(s) : n !== 0
}
function flat(args) {
  const out = []
  for (const a of args) {
    if (isRange(a)) { for (const row of a._grid) for (const c of row) out.push(c) }
    else if (Array.isArray(a)) out.push(...a)
    else out.push(a)
  }
  return out
}
function nums(args) {
  return flat(args)
    .filter(v => v !== '' && v !== null && v !== undefined && !isNaN(parseFloat(v)))
    .map(toNum)
}

// criteria like ">5", "<=10", "<>x", "=foo", or a plain value
function matchCrit(cell, crit) {
  const cs = toStr(crit).trim()
  const m = /^(>=|<=|<>|>|<|=)?(.*)$/.exec(cs)
  const op = m[1] || '='
  const rhs = m[2]
  const cn = parseFloat(cell), rn = parseFloat(rhs)
  const bothNum = !isNaN(cn) && !isNaN(rn)
  if (op === '=') return bothNum ? cn === rn : toStr(cell) === rhs
  if (op === '<>') return bothNum ? cn !== rn : toStr(cell) !== rhs
  if (!bothNum) return false
  if (op === '>') return cn > rn
  if (op === '<') return cn < rn
  if (op === '>=') return cn >= rn
  if (op === '<=') return cn <= rn
  return false
}

// ---- helpers for the expanded function set ----
function pad2(n) { return String(n).padStart(2, '0') }
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null
  const s = toStr(v).trim()
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}
function fmtDateISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
function variance(arr, sample) {
  if (arr.length < (sample ? 2 : 1)) return null
  const m = arr.reduce((s, x) => s + x, 0) / arr.length
  const ss = arr.reduce((s, x) => s + (x - m) * (x - m), 0)
  return ss / (arr.length - (sample ? 1 : 0))
}
function percentileOf(arr, k) {
  if (!arr.length) return '#NUM!'
  const s = arr.slice().sort((x, y) => x - y)
  if (k <= 0) return s[0]
  if (k >= 1) return s[s.length - 1]
  const pos = (s.length - 1) * k, lo = Math.floor(pos), frac = pos - lo
  return s[lo] + ((s[lo + 1] ?? s[lo]) - s[lo]) * frac
}
// build [ [rangeCells, criteria], ... ] then return the indices matching ALL
function critIndices(pairs) {
  if (!pairs.length) return []
  const len = pairs[0][0].length, idx = []
  for (let i = 0; i < len; i++) if (pairs.every(([r, cr]) => matchCrit(r[i], cr))) idx.push(i)
  return idx
}

const FUNCS = {
  SUM: a => nums(a).reduce((s, x) => s + x, 0),
  PRODUCT: a => nums(a).reduce((s, x) => s * x, 1),
  AVERAGE: a => { const n = nums(a); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : 0 },
  AVG: a => FUNCS.AVERAGE(a),
  MEDIAN: a => { const n = nums(a).sort((x, y) => x - y); if (!n.length) return 0; const m = Math.floor(n.length / 2); return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2 },
  MIN: a => { const n = nums(a); return n.length ? Math.min(...n) : 0 },
  MAX: a => { const n = nums(a); return n.length ? Math.max(...n) : 0 },
  COUNT: a => nums(a).length,
  COUNTA: a => flat(a).filter(v => v !== '' && v !== null && v !== undefined).length,
  COUNTIF: a => { const r = cells1D(a[0]); return r.filter(v => matchCrit(v, a[1])).length },
  SUMIF: a => { const r = cells1D(a[0]); const sr = a[2] != null ? cells1D(a[2]) : r; let s = 0; for (let i = 0; i < r.length; i++) if (matchCrit(r[i], a[1])) s += toNum(sr[i]); return s },
  AVERAGEIF: a => { const r = cells1D(a[0]); const sr = a[2] != null ? cells1D(a[2]) : r; let s = 0, c = 0; for (let i = 0; i < r.length; i++) if (matchCrit(r[i], a[1])) { s += toNum(sr[i]); c++ } return c ? s / c : 0 },
  ROUND: a => { const f = Math.pow(10, toNum(a[1] ?? 0)); return Math.round(toNum(a[0]) * f) / f },
  ROUNDUP: a => { const f = Math.pow(10, toNum(a[1] ?? 0)); return Math.ceil(toNum(a[0]) * f) / f },
  ROUNDDOWN: a => { const f = Math.pow(10, toNum(a[1] ?? 0)); return Math.floor(toNum(a[0]) * f) / f },
  INT: a => Math.floor(toNum(a[0])),
  ABS: a => Math.abs(toNum(a[0])),
  SQRT: a => Math.sqrt(toNum(a[0])),
  POWER: a => Math.pow(toNum(a[0]), toNum(a[1])),
  MOD: a => { const y = toNum(a[1]); return y === 0 ? '#DIV/0!' : toNum(a[0]) % y },
  IF: a => toBool(a[0]) ? (a[1] ?? '') : (a[2] ?? ''),
  IFERROR: a => { const v = a[0]; return (typeof v === 'string' && v.startsWith('#')) ? (a[1] ?? '') : v },
  AND: a => flat(a).every(toBool),
  OR: a => flat(a).some(toBool),
  NOT: a => !toBool(a[0]),
  CONCAT: a => flat(a).map(toStr).join(''),
  CONCATENATE: a => FUNCS.CONCAT(a),
  LEN: a => toStr(a[0]).length,
  LEFT: a => toStr(a[0]).slice(0, toNum(a[1] ?? 1)),
  RIGHT: a => { const s = toStr(a[0]); const n = toNum(a[1] ?? 1); return s.slice(s.length - n) },
  MID: a => toStr(a[0]).substring(toNum(a[1]) - 1, toNum(a[1]) - 1 + toNum(a[2])),
  UPPER: a => toStr(a[0]).toUpperCase(),
  LOWER: a => toStr(a[0]).toLowerCase(),
  TRIM: a => toStr(a[0]).trim(),
  // ---- lookup family ----
  LOOKUP: a => {
    const val = a[0]
    const vec = cells1D(a[1])
    const res = a[2] != null ? cells1D(a[2]) : vec
    let idx = vec.findIndex(v => String(v) === String(val))
    if (idx < 0) { // approximate: largest numeric <= val (assumes ascending)
      const lv = toNum(val); let best = -1
      for (let i = 0; i < vec.length; i++) { const n = parseFloat(vec[i]); if (!isNaN(n) && n <= lv) best = i }
      idx = best
    }
    return idx >= 0 ? (res[idx] ?? '') : '#N/A'
  },
  VLOOKUP: a => {
    const val = a[0], tbl = a[1], col = toNum(a[2])
    const exact = a[3] != null ? !toBool(a[3]) : false
    if (!isRange(tbl)) return '#N/A'
    const g = tbl._grid
    for (const row of g) {
      if (String(row[0]) === String(val) || (parseFloat(row[0]) === toNum(val) && !isNaN(parseFloat(row[0])))) {
        return row[col - 1] ?? '#REF!'
      }
    }
    if (!exact) { // approximate match on first column
      const lv = toNum(val); let best = null
      for (const row of g) { const n = parseFloat(row[0]); if (!isNaN(n) && n <= lv) best = row }
      if (best) return best[col - 1] ?? '#REF!'
    }
    return '#N/A'
  },
  HLOOKUP: a => {
    const val = a[0], tbl = a[1], rowIdx = toNum(a[2])
    if (!isRange(tbl)) return '#N/A'
    const g = tbl._grid; const header = g[0] || []
    for (let c = 0; c < header.length; c++) {
      if (String(header[c]) === String(val) || parseFloat(header[c]) === toNum(val)) {
        return (g[rowIdx - 1] && g[rowIdx - 1][c]) ?? '#REF!'
      }
    }
    return '#N/A'
  },
  INDEX: a => {
    const g = isRange(a[0]) ? a[0]._grid : [[a[0]]]
    const r = toNum(a[1]); const c = a[2] != null ? toNum(a[2]) : 1
    const row = g[r - 1]; if (!row) return '#REF!'
    return (row[c - 1] != null) ? row[c - 1] : (row[0] ?? '#REF!')
  },
  MATCH: a => {
    const val = a[0]; const arr = cells1D(a[1])
    for (let i = 0; i < arr.length; i++) if (String(arr[i]) === String(val) || (parseFloat(arr[i]) === toNum(val) && !isNaN(parseFloat(arr[i])))) return i + 1
    return '#N/A'
  },
  XLOOKUP: a => {
    const val = a[0], lk = cells1D(a[1]), ret = cells1D(a[2])
    let idx = lk.findIndex(v => String(v) === String(val) || (parseFloat(v) === toNum(val) && !isNaN(parseFloat(v))))
    if (idx < 0) return a[3] != null ? a[3] : '#N/A'
    return ret[idx] ?? '#N/A'
  },
  CHOOSE: a => { const i = toNum(a[0]); return a[i] != null ? a[i] : '#VALUE!' },
  COLUMNS: a => isRange(a[0]) ? (a[0]._grid[0] ? a[0]._grid[0].length : 0) : 1,
  ROWS: a => isRange(a[0]) ? a[0]._grid.length : 1,

  // ---- more math / trig ----
  SUMPRODUCT: a => { const arrs = a.map(cells1D); const len = Math.max(...arrs.map(x => x.length)); let s = 0; for (let i = 0; i < len; i++) { let p = 1; for (const arr of arrs) p *= toNum(arr[i]); s += p } return s },
  SUMSQ: a => nums(a).reduce((s, x) => s + x * x, 0),
  CEILING: a => { const sig = a[1] != null ? toNum(a[1]) : 1; return sig === 0 ? 0 : Math.ceil(toNum(a[0]) / sig) * sig },
  FLOOR: a => { const sig = a[1] != null ? toNum(a[1]) : 1; return sig === 0 ? 0 : Math.floor(toNum(a[0]) / sig) * sig },
  MROUND: a => { const m = toNum(a[1]); return m === 0 ? 0 : Math.round(toNum(a[0]) / m) * m },
  TRUNC: a => { const f = Math.pow(10, toNum(a[1] ?? 0)); return Math.trunc(toNum(a[0]) * f) / f },
  SIGN: a => Math.sign(toNum(a[0])),
  EXP: a => Math.exp(toNum(a[0])),
  LN: a => Math.log(toNum(a[0])),
  LOG: a => { const b = a[1] != null ? toNum(a[1]) : 10; return Math.log(toNum(a[0])) / Math.log(b) },
  LOG10: a => Math.log10(toNum(a[0])),
  PI: () => Math.PI,
  RAND: () => Math.random(),
  RANDBETWEEN: a => { const lo = toNum(a[0]), hi = toNum(a[1]); return Math.floor(Math.random() * (hi - lo + 1)) + lo },
  FACT: a => { let n = Math.floor(toNum(a[0])), r = 1; if (n < 0) return '#NUM!'; for (let i = 2; i <= n; i++) r *= i; return r },
  COMBIN: a => { const n = toNum(a[0]), k = toNum(a[1]); if (k < 0 || k > n) return 0; let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r) },
  PERMUT: a => { const n = toNum(a[0]), k = toNum(a[1]); let r = 1; for (let i = 0; i < k; i++) r *= (n - i); return r },
  QUOTIENT: a => { const d = toNum(a[1]); return d === 0 ? '#DIV/0!' : Math.trunc(toNum(a[0]) / d) },
  GCD: a => { const ns = nums(a).map(x => Math.abs(Math.trunc(x))); const g = (x, y) => y ? g(y, x % y) : x; return ns.reduce((x, y) => g(x, y), 0) },
  LCM: a => { const ns = nums(a).map(x => Math.abs(Math.trunc(x))); const g = (x, y) => y ? g(y, x % y) : x; const l = (x, y) => (x && y) ? x / g(x, y) * y : 0; return ns.reduce((x, y) => l(x, y)) },
  EVEN: a => { const n = toNum(a[0]); const r = Math.ceil(Math.abs(n) / 2) * 2; return n < 0 ? -r : r },
  ODD: a => { const n = toNum(a[0]); if (Math.abs(n) <= 1) return n < 0 ? -1 : 1; const r = Math.ceil((Math.abs(n) - 1) / 2) * 2 + 1; return n < 0 ? -r : r },
  SIN: a => Math.sin(toNum(a[0])),
  COS: a => Math.cos(toNum(a[0])),
  TAN: a => Math.tan(toNum(a[0])),
  ASIN: a => Math.asin(toNum(a[0])),
  ACOS: a => Math.acos(toNum(a[0])),
  ATAN: a => Math.atan(toNum(a[0])),
  ATAN2: a => Math.atan2(toNum(a[1]), toNum(a[0])),
  SINH: a => Math.sinh(toNum(a[0])),
  COSH: a => Math.cosh(toNum(a[0])),
  TANH: a => Math.tanh(toNum(a[0])),
  DEGREES: a => toNum(a[0]) * 180 / Math.PI,
  RADIANS: a => toNum(a[0]) * Math.PI / 180,

  // ---- more statistical ----
  COUNTBLANK: a => flat(a).filter(v => v === '' || v === null || v === undefined).length,
  COUNTIFS: a => { const p = []; for (let i = 0; i + 1 < a.length; i += 2) p.push([cells1D(a[i]), a[i + 1]]); return critIndices(p).length },
  SUMIFS: a => { const sr = cells1D(a[0]); const p = []; for (let i = 1; i + 1 < a.length; i += 2) p.push([cells1D(a[i]), a[i + 1]]); return critIndices(p).reduce((s, i) => s + toNum(sr[i]), 0) },
  AVERAGEIFS: a => { const sr = cells1D(a[0]); const p = []; for (let i = 1; i + 1 < a.length; i += 2) p.push([cells1D(a[i]), a[i + 1]]); const idx = critIndices(p); return idx.length ? idx.reduce((s, i) => s + toNum(sr[i]), 0) / idx.length : '#DIV/0!' },
  MAXIFS: a => { const sr = cells1D(a[0]); const p = []; for (let i = 1; i + 1 < a.length; i += 2) p.push([cells1D(a[i]), a[i + 1]]); const idx = critIndices(p); return idx.length ? Math.max(...idx.map(i => toNum(sr[i]))) : 0 },
  MINIFS: a => { const sr = cells1D(a[0]); const p = []; for (let i = 1; i + 1 < a.length; i += 2) p.push([cells1D(a[i]), a[i + 1]]); const idx = critIndices(p); return idx.length ? Math.min(...idx.map(i => toNum(sr[i]))) : 0 },
  LARGE: a => { const n = nums([a[0]]).sort((x, y) => y - x); const k = toNum(a[1]); return n[k - 1] ?? '#NUM!' },
  SMALL: a => { const n = nums([a[0]]).sort((x, y) => x - y); const k = toNum(a[1]); return n[k - 1] ?? '#NUM!' },
  RANK: a => { const v = toNum(a[0]); const arr = nums([a[1]]); const desc = a[2] == null || !toBool(a[2]); const s = arr.slice().sort((x, y) => desc ? y - x : x - y); const i = s.indexOf(v); return i < 0 ? '#N/A' : i + 1 },
  STDEV: a => { const v = variance(nums(a), true); return v == null ? '#DIV/0!' : Math.sqrt(v) },
  STDEVP: a => { const v = variance(nums(a), false); return v == null ? '#DIV/0!' : Math.sqrt(v) },
  VAR: a => { const v = variance(nums(a), true); return v == null ? '#DIV/0!' : v },
  VARP: a => { const v = variance(nums(a), false); return v == null ? '#DIV/0!' : v },
  MODE: a => { const n = nums(a); const cnt = {}; let best = null, bc = 0; for (const x of n) { cnt[x] = (cnt[x] || 0) + 1; if (cnt[x] > bc) { bc = cnt[x]; best = x } } return bc > 1 ? best : '#N/A' },
  GEOMEAN: a => { const n = nums(a); if (!n.length) return '#NUM!'; const p = n.reduce((s, x) => s * x, 1); return Math.pow(p, 1 / n.length) },
  HARMEAN: a => { const n = nums(a); if (!n.length) return '#NUM!'; return n.length / n.reduce((s, x) => s + 1 / x, 0) },
  PERCENTILE: a => percentileOf(nums([a[0]]), toNum(a[1])),
  QUARTILE: a => percentileOf(nums([a[0]]), toNum(a[1]) / 4),
  AVERAGEA: a => { const arr = flat(a).filter(v => v !== '' && v !== null && v !== undefined).map(toNum); return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0 },

  // ---- more text ----
  FIND: a => { const idx = toStr(a[1]).indexOf(toStr(a[0]), a[2] != null ? toNum(a[2]) - 1 : 0); return idx < 0 ? '#VALUE!' : idx + 1 },
  SEARCH: a => { const idx = toStr(a[1]).toLowerCase().indexOf(toStr(a[0]).toLowerCase(), a[2] != null ? toNum(a[2]) - 1 : 0); return idx < 0 ? '#VALUE!' : idx + 1 },
  REPLACE: a => { const s = toStr(a[0]); const start = toNum(a[1]) - 1; const len = toNum(a[2]); return s.slice(0, start) + toStr(a[3]) + s.slice(start + len) },
  SUBSTITUTE: a => { const s = toStr(a[0]), o = toStr(a[1]), nw = toStr(a[2]); if (o === '') return s; if (a[3] != null) { let n = toNum(a[3]), pos = -1; while (n-- > 0) { pos = s.indexOf(o, pos + 1); if (pos < 0) break } return pos < 0 ? s : s.slice(0, pos) + nw + s.slice(pos + o.length) } return s.split(o).join(nw) },
  REPT: a => toStr(a[0]).repeat(Math.max(0, toNum(a[1]))),
  TEXTJOIN: a => { const delim = toStr(a[0]); const ignore = toBool(a[1]); const parts = flat(a.slice(2)).map(toStr).filter(x => !ignore || x !== ''); return parts.join(delim) },
  PROPER: a => toStr(a[0]).replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase()),
  VALUE: a => toNum(a[0]),
  NUMBERVALUE: a => toNum(a[0]),
  CHAR: a => String.fromCharCode(toNum(a[0])),
  CODE: a => { const s = toStr(a[0]); return s.length ? s.charCodeAt(0) : '#VALUE!' },
  EXACT: a => toStr(a[0]) === toStr(a[1]),
  CLEAN: a => toStr(a[0]).replace(/[\x00-\x1F]/g, ''),
  TEXT: a => {
    const v = a[0], fmt = toStr(a[1]), n = parseFloat(v)
    if (isNaN(n)) return toStr(v)
    if (fmt.includes('%')) { const dec = (fmt.split('.')[1] || '').replace(/[^0#]/g, '').length; return (n * 100).toFixed(dec) + '%' }
    const dec = (fmt.split('.')[1] || '').replace(/[^0#]/g, '').length
    let out = n.toFixed(dec)
    if (fmt.includes(',')) { const parts = out.split('.'); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); out = parts.join('.') }
    return out
  },

  // ---- more logical ----
  IFS: a => { for (let i = 0; i + 1 < a.length; i += 2) if (toBool(a[i])) return a[i + 1] ?? ''; return '#N/A' },
  SWITCH: a => { const val = a[0]; for (let i = 1; i + 1 < a.length; i += 2) if (toStr(a[i]) === toStr(val) || (parseFloat(a[i]) === toNum(val) && !isNaN(parseFloat(a[i])))) return a[i + 1]; return (a.length % 2 === 0) ? a[a.length - 1] : '#N/A' },
  XOR: a => flat(a).filter(toBool).length % 2 === 1,
  IFNA: a => { const v = a[0]; return v === '#N/A' ? (a[1] ?? '') : v },
  TRUE: () => true,
  FALSE: () => false,

  // ---- date & time ----
  TODAY: () => fmtDateISO(new Date()),
  NOW: () => { const d = new Date(); return `${fmtDateISO(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` },
  DATE: a => { const dt = new Date(toNum(a[0]), toNum(a[1]) - 1, toNum(a[2])); return fmtDateISO(dt) },
  YEAR: a => { const d = parseDate(a[0]); return d ? d.getFullYear() : '#VALUE!' },
  MONTH: a => { const d = parseDate(a[0]); return d ? d.getMonth() + 1 : '#VALUE!' },
  DAY: a => { const d = parseDate(a[0]); return d ? d.getDate() : '#VALUE!' },
  HOUR: a => { const d = parseDate(a[0]); return d ? d.getHours() : '#VALUE!' },
  MINUTE: a => { const d = parseDate(a[0]); return d ? d.getMinutes() : '#VALUE!' },
  SECOND: a => { const d = parseDate(a[0]); return d ? d.getSeconds() : '#VALUE!' },
  WEEKDAY: a => { const d = parseDate(a[0]); if (!d) return '#VALUE!'; const t = a[1] != null ? toNum(a[1]) : 1; const w = d.getDay(); return t === 2 ? (w === 0 ? 7 : w) : w + 1 },
  DAYS: a => { const d1 = parseDate(a[0]), d2 = parseDate(a[1]); return d1 && d2 ? Math.round((d1 - d2) / 86400000) : '#VALUE!' },
  EDATE: a => { const d = parseDate(a[0]); if (!d) return '#VALUE!'; const nd = new Date(d.getFullYear(), d.getMonth() + toNum(a[1]), d.getDate()); return fmtDateISO(nd) },
  EOMONTH: a => { const d = parseDate(a[0]); if (!d) return '#VALUE!'; const nd = new Date(d.getFullYear(), d.getMonth() + toNum(a[1]) + 1, 0); return fmtDateISO(nd) },

  // ---- information ----
  ISNUMBER: a => { const v = a[0]; if (typeof v === 'number') return true; return typeof v === 'string' && v.trim() !== '' && !isNaN(parseFloat(v)) && isFinite(v) },
  ISTEXT: a => { const v = a[0]; return typeof v === 'string' && (v.trim() === '' ? false : isNaN(parseFloat(v))) },
  ISBLANK: a => a[0] === '' || a[0] === null || a[0] === undefined,
  ISERROR: a => typeof a[0] === 'string' && a[0].startsWith('#'),
  ISERR: a => typeof a[0] === 'string' && a[0].startsWith('#') && a[0] !== '#N/A',
  ISNA: a => a[0] === '#N/A',
  ISLOGICAL: a => typeof a[0] === 'boolean',
  ISEVEN: a => Math.abs(Math.trunc(toNum(a[0])) % 2) === 0,
  ISODD: a => Math.abs(Math.trunc(toNum(a[0])) % 2) === 1,
  N: a => { if (typeof a[0] === 'boolean') return a[0] ? 1 : 0; const n = parseFloat(a[0]); return isNaN(n) ? 0 : n },
  NA: () => '#N/A',
}

class Parser {
  constructor(src, resolve, depth) { this.s = src; this.i = 0; this.resolve = resolve; this.depth = depth || 0 }
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++ }
  peek() { this.ws(); return this.s[this.i] }

  cellValue(c, r) {
    let v = this.resolve(c, r)
    if (isFormula(v)) {
      if (this.depth > 60) return '#REF!'
      v = evalFormula(v, this.resolve, this.depth + 1)
    }
    return v
  }

  parseExpression() { return this.parseCompare() }

  parseCompare() {
    let left = this.parseAdd()
    for (;;) {
      this.ws()
      const two = this.s.substr(this.i, 2)
      let op = null
      if (two === '<=' || two === '>=' || two === '<>') { op = two; this.i += 2 }
      else { const c = this.s[this.i]; if (c === '=' || c === '<' || c === '>') { op = c; this.i++ } }
      if (!op) break
      const right = this.parseAdd()
      const bothNum = !isRange(left) && !isRange(right) && !Array.isArray(left) && !Array.isArray(right) &&
        left !== '' && right !== '' && !isNaN(parseFloat(left)) && !isNaN(parseFloat(right))
      const L = bothNum ? toNum(left) : toStr(left)
      const R = bothNum ? toNum(right) : toStr(right)
      if (op === '=') left = L === R
      else if (op === '<>') left = L !== R
      else if (op === '<') left = L < R
      else if (op === '>') left = L > R
      else if (op === '<=') left = L <= R
      else if (op === '>=') left = L >= R
    }
    return left
  }

  parseAdd() {
    let left = this.parseMul()
    for (;;) {
      const c = this.peek()
      if (c === '+') { this.i++; left = toNum(left) + toNum(this.parseMul()) }
      else if (c === '-') { this.i++; left = toNum(left) - toNum(this.parseMul()) }
      else break
    }
    return left
  }

  parseMul() {
    let left = this.parsePow()
    for (;;) {
      const c = this.peek()
      if (c === '*') { this.i++; left = toNum(left) * toNum(this.parsePow()) }
      else if (c === '/') { this.i++; const d = toNum(this.parsePow()); left = d === 0 ? NaN : toNum(left) / d }
      else break
    }
    return left
  }

  parsePow() {
    const left = this.parseUnary()
    if (this.peek() === '^') { this.i++; return Math.pow(toNum(left), toNum(this.parsePow())) }
    return left
  }

  parseUnary() {
    const c = this.peek()
    if (c === '-') { this.i++; return -toNum(this.parseUnary()) }
    if (c === '+') { this.i++; return toNum(this.parseUnary()) }
    return this.parsePrimary()
  }

  parsePrimary() {
    this.ws()
    const rest = this.s.slice(this.i)
    const c = this.s[this.i]

    if (c === '(') { this.i++; const v = this.parseExpression(); this.ws(); if (this.s[this.i] === ')') this.i++; return v }
    if (c === '"') {
      this.i++
      let str = ''
      while (this.i < this.s.length && this.s[this.i] !== '"') { str += this.s[this.i]; this.i++ }
      this.i++ // closing quote
      return str
    }

    const idM = /^[A-Za-z_]+/.exec(rest)
    if (idM) {
      const word = idM[0]
      let j = this.i + word.length
      while (j < this.s.length && /\s/.test(this.s[j])) j++
      if (this.s[j] === '(') {         // function call
        this.i = j + 1
        const args = this.parseArgs()
        this.ws(); if (this.s[this.i] === ')') this.i++
        const fn = FUNCS[word.toUpperCase()]
        return fn ? fn(args) : '#NAME?'
      }
      const refM = /^([A-Za-z]+)(\d+)/.exec(rest)
      if (refM) {                      // cell ref, maybe a range
        this.i += refM[0].length
        const c1 = colToIndex(refM[1].toUpperCase()), r1 = parseInt(refM[2], 10) - 1
        this.ws()
        if (this.s[this.i] === ':') {
          this.i++; this.ws()
          const refM2 = /^([A-Za-z]+)(\d+)/.exec(this.s.slice(this.i))
          if (refM2) {
            this.i += refM2[0].length
            const c2 = colToIndex(refM2[1].toUpperCase()), r2 = parseInt(refM2[2], 10) - 1
            const grid = []
            for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
              const row = []
              for (let cc = Math.min(c1, c2); cc <= Math.max(c1, c2); cc++) row.push(this.cellValue(cc, r))
              grid.push(row)
            }
            return { _grid: grid }
          }
        }
        return this.cellValue(c1, r1)
      }
      const up = word.toUpperCase()
      if (up === 'TRUE') { this.i += word.length; return true }
      if (up === 'FALSE') { this.i += word.length; return false }
      this.i += word.length
      return '#NAME?'
    }

    const numM = /^\d*\.?\d+/.exec(rest)
    if (numM) { this.i += numM[0].length; return parseFloat(numM[0]) }

    this.i++ // skip unknown char
    return 0
  }

  parseArgs() {
    const args = []
    this.ws()
    if (this.s[this.i] === ')') return args
    for (;;) {
      args.push(this.parseExpression())
      this.ws()
      if (this.s[this.i] === ',') { this.i++; continue }
      break
    }
    return args
  }
}

export function evalFormula(formula, resolve, depth = 0) {
  try {
    const src = String(formula).trim().slice(1) // drop leading '='
    if (!src) return ''
    const p = new Parser(src, resolve, depth)
    let v = p.parseExpression()
    if (isRange(v)) v = cells1D(v)[0] ?? ''
    else if (Array.isArray(v)) v = v.length ? v[0] : ''
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
    if (typeof v === 'number') { if (!isFinite(v)) return '#DIV/0!'; return Math.round(v * 1e10) / 1e10 }
    return (v === null || v === undefined) ? '' : v
  } catch (e) {
    return '#ERROR!'
  }
}
