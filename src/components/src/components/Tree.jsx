export default function Tree({ tree, activeSheet, onSelect, onNewSheet }) {
  return (
    <div className="tree">
      <div className="head"><span>Sheets</span><button title="New sheet" onClick={onNewSheet}>+</button></div>
      {tree.length === 0 && <div className="empty" style={{ padding: '20px 14px', fontSize: 12 }}>No sheets yet. Click + or Import.</div>}
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
                    <button key={s.id}
                      className={'node sheet' + (activeSheet && activeSheet.id === s.id ? ' active' : '')}
                      onClick={() => onSelect(s)}>
                      <span className="ico">▤</span>{s.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
