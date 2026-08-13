// React cell renderer for status/priority pills.
const COLOR = {
  open:'gray', assigned:'blue', in_progress:'blue', on_hold:'amber', resolved:'green',
  closed:'green', reopened:'red', pending:'amber', approved:'green', rejected:'red',
  low:'gray', medium:'blue', high:'amber', critical:'red',
  done:'green', todo:'gray', not_started:'gray',
}
export function PillRenderer(p) {
  const v = p.value
  if (v == null || v === '') return null
  const color = COLOR[String(v).toLowerCase()] || 'gray'
  return <span className={'pill p-' + color}>{String(v).replace(/_/g, ' ')}</span>
}
export const inr = (p) => p.value != null && p.value !== '' ? '₹' + Number(p.value).toLocaleString('en-IN') : ''
