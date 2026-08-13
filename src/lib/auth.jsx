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
    const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    setProfile(data || null)
  }

  async function denyAndOut(reason) {
    setDenied(reason)
    await supabase.auth.signOut()
    setSession(null); setProfile(null)
    return false
  }

  // Gate: open access — anyone can sign in with Google (no domain / no allowlist).
  //  - Email/password (provider 'email', Admin tab): admin role still required.
  async function checkAllowed(s) {
    const email = s?.user?.email
    if (!email) return true
    const provider = s?.user?.app_metadata?.provider || 'email'

    // Admin tab (email/password) stays admins-only.
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
    let done = false
    // If we're returning from an OAuth redirect (token in URL hash), keep showing
    // the loader until onAuthStateChange delivers the session — avoids a flash of Login.
    const hasOAuthHash = typeof window !== 'undefined' && /access_token=|code=/.test(window.location.hash + window.location.search)

    supabase.auth.getSession().then(async ({ data }) => {
      if (done) return
      if (!data.session && hasOAuthHash) return  // wait for the listener; stay loading
      if (data.session && !(await checkAllowed(data.session))) { setLoading(false); done = true; return }
      setSession(data.session); await loadProfile(data.session?.user?.id)
      setLoading(false); done = true
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (s && !(await checkAllowed(s))) { setLoading(false); done = true; return }
      setSession(s); await loadProfile(s?.user?.id)
      setLoading(false); done = true
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
