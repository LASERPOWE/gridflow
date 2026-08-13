import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)
const WRITE = ['super_admin', 'org_admin', 'dept_admin', 'manager', 'editor']
const ADMIN_ROLES = ['super_admin', 'org_admin', 'dept_admin', 'manager']

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState('')   // set if email not on allowlist

  async function loadProfile(id) {
    if (!id) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
    setProfile(data || null)
  }

  async function denyAndOut(reason) {
    setDenied(reason)
    await supabase.auth.signOut()
    setSession(null); setProfile(null)
    return false
  }

  // Gate: enforce per-tab rules, fail-open on transient errors.
  //  - Google (provider 'google'): must be @laserpowerinfra.com AND on allowlist.
  //  - Email/password (provider 'email'): admin role required (Admin tab).
  async function checkAllowed(s) {
    const email = s?.user?.email
    if (!email) return true
    const provider = s?.user?.app_metadata?.provider || 'email'

    // Rule 1: Google logins restricted to company domain.
    if (provider === 'google' && !email.toLowerCase().endsWith('@laserpowerinfra.com')) {
      return denyAndOut(email)
    }

    // Rule 2: confirm the email is on the allowlist (skip deny on query error).
    let found = false, confirmed = false
    for (let attempt = 0; attempt < 2 && !found; attempt++) {
      const { data, error } = await supabase.from('allowed_emails').select('email').ilike('email', email)
      if (error) { confirmed = false; break }
      confirmed = true
      if (data && data.length > 0) { found = true; break }
      await new Promise(r => setTimeout(r, 400))
    }
    if (confirmed && !found) return denyAndOut(email)

    // Rule 3: Admin tab (email/password) is admins-only.
    if (provider === 'email') {
      const { data: p, error } = await supabase.from('profiles').select('global_role').eq('id', s.user.id).maybeSingle()
      if (!error && p && !ADMIN_ROLES.includes(p.global_role)) {
        return denyAndOut('NOT_ADMIN')
      }
    }

    setDenied('')
    return true
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session && !(await checkAllowed(data.session))) { setLoading(false); return }
      setSession(data.session); await loadProfile(data.session?.user?.id); setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (s && !(await checkAllowed(s))) return
      setSession(s); await loadProfile(s?.user?.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const role = profile?.global_role || 'viewer'
  const value = {
    session, user: session?.user || null, profile, role, loading,
    denied, clearDenied: () => setDenied(''),
    canWrite: WRITE.includes(role),
    isAdmin: ['super_admin', 'org_admin'].includes(role),
    isApprover: ['super_admin', 'org_admin', 'dept_admin', 'manager'].includes(role),
    signIn: (e, p) => supabase.auth.signInWithPassword({ email: e, password: p }),
    signUp: (e, p, n) => supabase.auth.signUp({ email: e, password: p, options: { data: { full_name: n } } }),
    signInWithGoogle: () => supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    }),
    signOut: () => supabase.auth.signOut(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
