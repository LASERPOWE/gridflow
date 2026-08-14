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
      if (up === 'TRUE') return true
      if (up === 'FALSE') return false
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
