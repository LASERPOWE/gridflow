// Colored pill for status/priority. Returns an HTML STRING (AG Grid renders it).
const COLOR = { open:'gray', assigned:'blue', in_progress:'blue', on_hold:'amber', resolved:'green', closed:'green', reopened:'red', pending:'amber', approved:'green', rejected:'red', low:'gray', medium:'blue', high:'amber', critical:'red', done:'green', todo:'gray', not_started:'gray' }
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
export function pillRenderer(p) {
  const v = p.value
  if (v == null || v === '') return ''
  const color = COLOR[String(v).toLowerCase()] || 'gray'
  return '<span class="pill p-' + color + '">' + esc(String(v).replace(/_/g, ' ')) + '</span>'
}
export const inr = (p) => p.value != null && p.value !== '' ? '₹' + Number(p.value).toLocaleString('en-IN') : ''
