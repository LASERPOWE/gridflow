import { supabase } from './supabase'

// Best-effort audit logging. Never throws and never blocks the UI — if the
// activity_log table isn't set up yet (or a write fails), we silently skip.
// One row per change. `profile` is the current user's profile ({id,email,full_name}).
export async function logActivity(profile, entry) {
  if (!profile?.id || !entry?.sheet_id) return
  try {
    const rec = {
      user_id: profile.id,
      user_email: profile.email || null,
      user_name: profile.full_name || profile.name || null,
      ...entry,
    }
    // stringify values so the column stays text regardless of cell type
    if (rec.old_value != null && typeof rec.old_value !== 'string') rec.old_value = String(rec.old_value)
    if (rec.new_value != null && typeof rec.new_value !== 'string') rec.new_value = String(rec.new_value)
    await supabase.from('activity_log').insert(rec)
  } catch { /* table not set up yet — ignore */ }
}

// Log many changes at once (e.g. a bulk delete). Silently ignores failures.
export async function logActivityMany(profile, entries) {
  if (!profile?.id || !entries?.length) return
  try {
    const recs = entries.map(e => ({
      user_id: profile.id,
      user_email: profile.email || null,
      user_name: profile.full_name || profile.name || null,
      ...e,
    }))
    await supabase.from('activity_log').insert(recs)
  } catch { /* ignore */ }
}
