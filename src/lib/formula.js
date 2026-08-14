// Lightweight Excel-style formula engine.
// Supports: numbers, + - * / ( ), cell refs (A1), ranges (A1:A5),
// and functions SUM, AVERAGE, MIN, MAX, COUNT, ROUND, ABS, IF, CONCAT.
// getCell(colIdx, rowIdx) -> raw value of a cell (0-based indexes).

function colToIndex(letters) {
  let n = 0
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64)
  return n - 1
}

// Parse "A1" -> {c, r} (0-based). Returns null if not a ref.
function parseRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) return null
  return { c: colToIndex(m[1]), r: parseInt(m[2], 10) - 1 }
}

export function isFormula(v) {
  return typeof v === 'string' && v.trim().startsWith('=')
}

// Evaluate a formula string. resolve(colIdx,rowIdx) returns a cell's raw value.
export function evalFormula(formula, resolve) {
  try {
    let expr = formula.trim().slice(1) // drop '='
    const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
    const cellVal = (c, r) => {
      let v = resolve(c, r)
      if (isFormula(v)) v = evalFormula(v, resolve) // nested
      return v
    }
    const rangeVals = (a, b) => {
      const A = parseRef(a), B = parseRef(b); if (!A || !B) return []
      const out = []
      for (let r = Math.min(A.r, B.r); r <= Math.max(A.r, B.r); r++)
        for (let c = Math.min(A.c, B.c); c <= Math.max(A.c, B.c); c++)
          out.push(cellVal(c, r))
      return out
    }

    // Replace function calls (SUM/AVERAGE/etc.)
    expr = expr.replace(/([A-Z]+)\s*\(([^()]*)\)/gi, (whole, fn, args) => {
      fn = fn.toUpperCase()
      // range arg like A1:A5
      const rangeM = /^\s*([A-Z]+\d+)\s*:\s*([A-Z]+\d+)\s*$/.exec(args)
      let vals
      if (rangeM) vals = rangeVals(rangeM[1], rangeM[2])
      else vals = args.split(',').map(a => {
        a = a.trim()
        const ref = parseRef(a)
        if (ref) return cellVal(ref.c, ref.r)
        return a
      })
      const nums = vals.map(num)
      switch (fn) {
        case 'SUM': return nums.reduce((s, x) => s + x, 0)
        case 'AVERAGE': return nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : 0
        case 'MIN': return nums.length ? Math.min(...nums) : 0
        case 'MAX': return nums.length ? Math.max(...nums) : 0
        case 'COUNT': return vals.filter(v => v !== '' && v != null && !isNaN(parseFloat(v))).length
        case 'ROUND': return Math.round((nums[0] || 0) * Math.pow(10, nums[1] || 0)) / Math.pow(10, nums[1] || 0)
        case 'ABS': return Math.abs(nums[0] || 0)
        case 'CONCAT': return vals.join('')
        case 'IF': {
          // IF(cond, a, b) — cond as "x>y" style already substituted below; here args are values
          return vals[0] ? vals[1] : vals[2]
        }
        default: return whole
      }
    })

    // Replace remaining cell refs with values
    expr = expr.replace(/\b([A-Z]+)(\d+)\b/g, (w, col, row) => {
      const v = cellVal(colToIndex(col), parseInt(row, 10) - 1)
      const n = parseFloat(v)
      return isNaN(n) ? JSON.stringify(String(v ?? '')) : String(n)
    })

    // Only allow safe characters now
    if (!/^[\d\s+\-*/().,"'<>=!&|]*$/.test(expr.replace(/"[^"]*"/g, ''))) return '#ERR'
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict";return (' + expr + ')')()
    return (result === undefined || result === null) ? '' : result
  } catch (e) {
    return '#ERR'
  }
}
