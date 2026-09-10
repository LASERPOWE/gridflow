import { useState } from 'react'

// First-visit walkthrough. Different, easy explanations for an Admin vs a
// normal User — each sees only what's relevant to them.
const STEPS_ADMIN = [
  { emoji: '👋', title: 'Welcome, Admin!',
    body: 'You have full control here. A quick 30-second tour of what you can do. Skip anytime.' },
  { emoji: '🗂', title: 'Your sheets are the bottom tabs',
    body: 'Every tab at the bottom is a sheet — like Excel. Click to open, double-click to rename, and ＋ makes a new one.' },
  { emoji: '⌨', title: 'Type in any cell',
    body: 'Click a cell and type. Simple maths like 45-2 auto-calculates. Start with = for a formula, e.g. =SUM(A1:A5).' },
  { emoji: '☑', title: 'Select rows to act in bulk',
    body: 'Tick the boxes on the left to pick rows, then Duplicate or Delete them all together from the bar that pops up.' },
  { emoji: '🛡', title: 'Admin panel = your control room',
    body: 'Open Admin (left rail) to manage users, grant who can see which sheet, and review access requests.' },
  { emoji: '🔑', title: 'Column Permissions (per user)',
    body: 'In Admin → Column Permissions, pick a sheet + a user and choose, column by column, what they can view, edit or filter.' },
  { emoji: '🔗', title: 'Share & you’re set',
    body: 'Use Share to give teammates access to a sheet. That’s it — you’re ready to go!' },
]

const STEPS_USER = [
  { emoji: '👋', title: 'Welcome to smartsheet by Laser Power',
    body: 'A quick 20-second tour of how to add and see your data. You can skip anytime.' },
  { emoji: '🗂', title: 'Your sheets are the bottom tabs',
    body: 'The tabs at the bottom are the sheets shared with you. Tap one to open it.' },
  { emoji: '📝', title: 'Fill the form to add an entry',
    body: 'Type your details into the fields and press Submit — it adds a new row to the sheet. Simple as that.' },
  { emoji: '✅', title: 'Fill every field',
    body: 'All fields are needed. If you miss one, you’ll get a clear message telling you exactly what to fill.' },
  { emoji: '👀', title: 'You see only your columns',
    body: 'You get the columns your admin shared with you. Need something you can’t see? Ask your admin for access.' },
  { emoji: '🎉', title: 'That’s it!',
    body: 'You’re ready. Open a sheet from the bottom and add your first entry.' },
]

export default function Tour({ onClose, isAdmin }) {
  const STEPS = isAdmin ? STEPS_ADMIN : STEPS_USER
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
