import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)
const WRITE = ['super_admin', 'org_admin', 'dept_admin', 'manager', 'editor']

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

  // Allowlist gate: sign out only if the email is CONFIRMED absent.
  // On any query error we fail-open (allow) so a transient hiccup never locks a valid user out.
  async function checkAllowed(s) {
    const email = s?.user?.email
    if (!email) return true
    let found = false, confirmed = false
    for (let attempt = 0; attempt < 2 && !found; attempt++) {
      const { data, error } = await supabase
        .from('allowed_emails').select('email').ilike('email', email)
      if (error) { confirmed = false; break }      // query failed → don't deny
      confirmed = true
      if (data && data.length > 0) { found = true; break }
      await new Promise(r => setTimeout(r, 400))    // brief retry for propagation
    }
    if (confirmed && !found) {
      setDenied(email)
      await supabase.auth.signOut()
      setSession(null); setProfile(null)
      return false
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
