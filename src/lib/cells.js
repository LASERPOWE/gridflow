// Colored pill renderer for status/priority columns (Smartsheet-style)
const COLOR = {
  open:'gray', assigned:'blue', in_progress:'blue', on_hold:'amber', resolved:'green',
  closed:'green', reopened:'red', pending:'amber', approved:'green', rejected:'red',
  low:'gray', medium:'blue', high:'amber', critical:'red',
  done:'green', todo:'gray', 'not_started':'gray',
}
export function pillRenderer(p) {
  const v = p.value
  if (v == null || v === '') return document.createTextNode('')
  const s = document.createElement('span')
  s.className = 'pill p-' + (COLOR[String(v).toLowerCase()] || 'gray')
  s.textContent = String(v).replace(/_/g, ' ')
  return s
}
export const inr = (p) => p.value != null && p.value !== '' ? '₹' + Number(p.value).toLocaleString('en-IN') : ''
