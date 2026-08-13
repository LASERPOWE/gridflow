import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)
const WRITE = ['super_admin', 'org_admin', 'dept_admin', 'manager', 'editor']

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(id) {
    if (!id) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
    setProfile(data || null)
  }
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session); await loadProfile(data.session?.user?.id); setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s); await loadProfile(s?.user?.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const role = profile?.global_role || 'viewer'
  const value = {
    session, user: session?.user || null, profile, role, loading,
    canWrite: WRITE.includes(role),
    isAdmin: ['super_admin', 'org_admin'].includes(role),
    signIn: (e, p) => supabase.auth.signInWithPassword({ email: e, password: p }),
    signUp: (e, p, n) => supabase.auth.signUp({ email: e, password: p, options: { data: { full_name: n } } }),
    signOut: () => supabase.auth.signOut(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
