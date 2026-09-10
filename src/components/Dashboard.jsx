import { useMemo } from 'react'

// A read-only summary of the current sheet: totals for numeric columns and
// distribution charts for dropdown / checkbox columns. Pure SVG — no chart lib.
const PALETTE = ['#2f5bd6', '#16a34a', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#64748b', '#0ea5e9', '#a3e635']

function fmtNum(n, type) {
  if (n == null || isNaN(n)) return '—'
  const r = Math.round(n * 100) / 100
  const s = r.toLocaleString('en-IN')
  if (type === 'currency') return '₹' + s
  if (type === 'percent') return s + '%'
  return s
}

function Donut({ data }) {
  // data: [{label, value, color}]
  const total = data.reduce((a, d) => a + d.value, 0) || 1
  let acc = 0
  const R = 52, C = 2 * Math.PI * R
  return (
    <div className="db-donut">
      <svg viewBox="0 0 130 130" width="130" height="130">
        <circle cx="65" cy="65" r={R} fill="none" stroke="#eef2f7" strokeWidth="18" />
        {data.map((d, i) => {
          const frac = d.value / total
          const dash = frac * C
          const el = (
            <circle key={i} cx="65" cy="65" r={R} fill="none" stroke={d.color} strokeWidth="18"
              strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc * C}
              transform="rotate(-90 65 65)" />
          )
          acc += frac
          return el
        })}
        <text x="65" y="61" textAnchor="middle" className="db-donut-num">{total}</text>
        <text x="65" y="78" textAnchor="middle" className="db-donut-lbl">total</text>
      </svg>
      <div className="db-legend">
        {data.map((d, i) => (
          <div className="db-leg" key={i}>
            <i style={{ background: d.color }} />
            <span className="db-leg-l">{d.label}</span>
            <span className="db-leg-v">{d.value} · {Math.round(d.value / total * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Bars({ data }) {
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <div className="db-bars">
      {data.map((d, i) => (
        <div className="db-bar-row" key={i}>
          <span className="db-bar-l" title={d.label}>{d.label}</span>
          <div className="db-bar-track"><div className="db-bar-fill" style={{ width: (d.value / max * 100) + '%', background: d.color }} /></div>
          <span className="db-bar-v">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard({ sheet, cols, rows }) {
  const dataRows = useMemo(() => rows.filter(r => r?.id), [rows])

  const numericCards = useMemo(() => {
    return cols.filter(c => ['number', 'currency', 'percent'].includes(c.type)).map(c => {
      const nums = dataRows.map(r => parseFloat(r.data?.[c.key])).filter(v => !isNaN(v))
      const sum = nums.reduce((a, b) => a + b, 0)
      const avg = nums.length ? sum / nums.length : null
      return { col: c, count: nums.length, sum, avg, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null }
    })
  }, [cols, dataRows])

  const catCharts = useMemo(() => {
    return cols.filter(c => c.type === 'select' || c.type === 'checkbox' || (c.options && c.options.length)).map(c => {
      const counts = {}
      dataRows.forEach(r => {
        let v = r.data?.[c.key]
        if (c.type === 'checkbox') v = v ? 'Checked' : 'Unchecked'
        v = (v == null || v === '') ? '(empty)' : String(v)
        counts[v] = (counts[v] || 0) + 1
      })
      const data = Object.entries(counts).sort((a, b) => b[1] - a[1])
        .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }))
      return { col: c, data, kind: data.length <= 6 ? 'donut' : 'bars' }
    })
  }, [cols, dataRows])

  return (
    <div className="db-wrap">
      <div className="db-top">
        <h2 className="db-title">📊 {sheet.name} — Dashboard</h2>
        <span className="db-sub">Live summary of your sheet data</span>
      </div>

      <div className="db-stat-row">
        <div className="db-stat">
          <div className="db-stat-n">{dataRows.length.toLocaleString('en-IN')}</div>
          <div className="db-stat-l">Total rows</div>
        </div>
        <div className="db-stat">
          <div className="db-stat-n">{cols.length}</div>
          <div className="db-stat-l">Columns</div>
        </div>
        {numericCards.slice(0, 2).map(nc => (
          <div className="db-stat" key={nc.col.key}>
            <div className="db-stat-n">{fmtNum(nc.sum, nc.col.type)}</div>
            <div className="db-stat-l">Total {nc.col.label}</div>
          </div>
        ))}
      </div>

      {numericCards.length > 0 && (
        <div className="db-section">
          <h3 className="db-h">Numbers</h3>
          <div className="db-num-grid">
            {numericCards.map(nc => (
              <div className="db-card" key={nc.col.key}>
                <div className="db-card-t">{nc.col.label}</div>
                <div className="db-num-main">{fmtNum(nc.sum, nc.col.type)}</div>
                <div className="db-num-sub">
                  <span>Avg {fmtNum(nc.avg, nc.col.type)}</span>
                  <span>Min {fmtNum(nc.min, nc.col.type)}</span>
                  <span>Max {fmtNum(nc.max, nc.col.type)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {catCharts.length > 0 && (
        <div className="db-section">
          <h3 className="db-h">Breakdowns</h3>
          <div className="db-chart-grid">
            {catCharts.map(cc => (
              <div className="db-card" key={cc.col.key}>
                <div className="db-card-t">{cc.col.label}</div>
                {cc.data.length === 0
                  ? <div className="db-empty">No data yet</div>
                  : cc.kind === 'donut' ? <Donut data={cc.data} /> : <Bars data={cc.data} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {numericCards.length === 0 && catCharts.length === 0 && (
        <div className="db-none">No number or dropdown columns to chart yet. Add a Number or Dropdown column to see summaries here.</div>
      )}
    </div>
  )
}
