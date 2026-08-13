import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { isConfigured } from '../lib/supabase'

function Logo() {
  return (
    <div className="logo" style={{ fontFamily: 'Manrope,sans-serif' }}>
      <span className="sq"><i/><i/><i/><i/></span> smartsheet
      <span style={{ fontWeight: 500, fontSize: 12, color: '#69707d', letterSpacing: 1, marginLeft: 4 }}>by Laser Power</span>
    </div>
  )
}

export default function Login() {
  const { signIn, signInWithGoogle, denied, clearDenied } = useAuth()
  const [tab, setTab] = useState('user')      // user | admin
  const [email, setEmail] = useState(''); const [pass, setPass] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)

  async function google() {
    setErr(''); clearDenied && clearDenied()
    const { error } = await signInWithGoogle()
    if (error) setErr(error.message)
  }
  async function adminSubmit(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await signIn(email, pass)
    setBusy(false)
    if (error) setErr(error.message)
    // role check (admin-only) happens in AuthProvider after session is set
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Logo />
        <p className="sub" style={{ marginTop: 14 }}>Fast sheets, live database</p>

        {/* tabs */}
        <div className="auth-tabs">
          <button type="button" className={'auth-tab' + (tab === 'user' ? ' on' : '')}
            onClick={() => { setTab('user'); setErr('') }}>User</button>
          <button type="button" className={'auth-tab' + (tab === 'admin' ? ' on' : '')}
            onClick={() => { setTab('admin'); setErr('') }}>Admin</button>
        </div>

        {denied === 'NOT_ADMIN'
          ? <div className="err">This account is not an admin. Please use the <b>User</b> tab to sign in with Google.</div>
          : denied && <div className="err">Access denied for <b>{denied}</b>. {denied.toLowerCase().endsWith('@laserpowerinfra.com') ? 'Ask an admin to grant access.' : 'Use your @laserpowerinfra.com Google account.'}</div>}
        {!isConfigured && <div className="notice">Add your Supabase key in <code>.env</code> and restart.</div>}

        {tab === 'user' ? (
          <div className="auth-pane">
            <p className="auth-hint">Sign in with your Google account.</p>
            <button type="button" className="btn-google" onClick={google}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.1C12.2 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.8-9.9 6.8-17.4z"/><path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.3-5.7c-2 1.4-4.7 2.3-7.9 2.3-6.4 0-11.8-4.1-13.6-9.9l-7.9 6.1C6.4 42.6 14.6 48 24 48z"/></svg>
              Continue with Google
            </button>
            {err && <div className="err">{err}</div>}
          </div>
        ) : (
          <form className="auth-pane" onSubmit={adminSubmit}>
            <p className="auth-hint">Admins sign in with email &amp; password.</p>
            <label>Email</label>
            <input type="email" name="email" autoComplete="username" value={email}
              onChange={e => setEmail(e.target.value)} required placeholder="you@laserpowerinfra.com" />
            <label>Password</label>
            <input type="password" name="password" autoComplete="current-password" value={pass}
              onChange={e => setPass(e.target.value)} required placeholder="••••••••" />
            {err && <div className="err">{err}</div>}
            <button className="btn block" style={{ marginTop: 16 }} disabled={busy}>
              {busy ? 'Please wait…' : 'Sign in as admin'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
