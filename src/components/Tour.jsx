import { useState } from 'react'

// Simple, robust first-visit walkthrough — a centred card that steps through the
// key features. No element-anchored spotlight (which breaks when layout shifts);
// each step just explains one thing with an emoji cue.
const STEPS = [
  { emoji: '👋', title: 'Welcome to smartsheet by Laser Power',
    body: 'A quick 20-second tour of the basics. You can skip anytime.' },
  { emoji: '🗂', title: 'Your sheets live at the bottom',
    body: 'The tabs along the bottom are your sheets — like Excel. Click one to open it, double-click to rename, and ＋ makes a new one.' },
  { emoji: '⌨', title: 'Type in any cell',
    body: 'Click a cell and start typing. Plain maths like 45-2 or 20*3 auto-calculates. Start with = for a formula, e.g. =SUM(A1:A5).' },
  { emoji: 'ƒx', title: 'Formula bar + point-and-click',
    body: 'While a formula is open, click other cells to drop their references in. The formula bar up top mirrors the selected cell.' },
  { emoji: '☑', title: 'Select rows to act in bulk',
    body: 'Tick the checkboxes on the left to select rows, then Duplicate or Delete them all at once from the bar that appears.' },
  { emoji: '👁', title: 'Editor view vs User view',
    body: 'Editor view is the full table. User view shows the clean data-entry form — handy for quick, guided input.' },
  { emoji: '🔗', title: 'Share & you’re set',
    body: 'Use Share to give teammates access. That’s it — dive in!' },
]

export default function Tour({ onClose }) {
  const [i, setI] = useState(0)
  const s = STEPS[i]
  const last = i === STEPS.length - 1
  return (
    <div className="tour-ov" onClick={onClose}>
      <div className="tour-card" onClick={e => e.stopPropagation()}>
        <div className="tour-emoji">{s.emoji}</div>
        <h3 className="tour-title">{s.title}</h3>
        <p className="tour-body">{s.body}</p>
        <div className="tour-dots">
          {STEPS.map((_, k) => <span key={k} className={'tour-dot' + (k === i ? ' on' : '')} onClick={() => setI(k)} />)}
        </div>
        <div className="tour-actions">
          <button className="tour-skip" onClick={onClose}>{last ? '' : 'Skip'}</button>
          <div className="tour-nav">
            {i > 0 && <button className="tour-btn ghost" onClick={() => setI(i - 1)}>Back</button>}
            {last
              ? <button className="tour-btn" onClick={onClose}>Got it 🎉</button>
              : <button className="tour-btn" onClick={() => setI(i + 1)}>Next</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
