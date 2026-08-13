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
  const { signIn, signUp, signInWithGoogle, denied, clearDenied } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState(''); const [pass, setPass] = useState(''); const [name, setName] = useState('')
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true)
    const { error } = mode === 'signin' ? await signIn(email, pass) : await signUp(email, pass, name)
    setBusy(false)
    if (error) return setErr(error.message)
    if (mode === 'signup') setMsg('Account created — sign in now.')
  }
  async function google() {
    setErr(''); clearDenied && clearDenied()
    const { error } = await signInWithGoogle()
    if (error) setErr(error.message)
  }
  return (
    <div className="auth-wrap"><form className="auth-card" onSubmit={submit}>
      <Logo />
      <h1>{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
      <p className="sub">Fast sheets, live database</p>
      {denied && <div className="err">Access denied for <b>{denied}</b>. Ask an admin to add your email.</div>}
      {!isConfigured && <div className="notice">Add your Supabase key in <code>.env</code> and restart.</div>}

      <button type="button" className="btn-google" onClick={google}>
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.1C12.2 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.8-9.9 6.8-17.4z"/><path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.3-5.7c-2 1.4-4.7 2.3-7.9 2.3-6.4 0-11.8-4.1-13.6-9.9l-7.9 6.1C6.4 42.6 14.6 48 24 48z"/></svg>
        Continue with Google
      </button>
      <div className="or-sep"><span>or</span></div>
      {mode === 'signup' && (<><label>Full name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></>)}
      <label>Email</label>
      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@company.com"/>
      <label>Password</label>
      <input type="password" value={pass} onChange={e=>setPass(e.target.value)} required placeholder="••••••••"/>
      {err && <div className="err">{err}</div>}
      {msg && <div className="notice">{msg}</div>}
      <button className="btn block" style={{marginTop:16}} disabled={busy}>{busy?'Please wait…':mode==='signin'?'Sign in':'Sign up'}</button>
      <p style={{textAlign:'center',marginTop:14}}>
        {mode==='signin'
          ? <button type="button" className="link" onClick={()=>setMode('signup')}>No account? Create one</button>
          : <button type="button" className="link" onClick={()=>setMode('signin')}>Have an account? Sign in</button>}
      </p>
    </form></div>
  )
}
