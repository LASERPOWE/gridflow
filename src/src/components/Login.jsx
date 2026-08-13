import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { isConfigured } from '../lib/supabase'

function Logo() {
  return <div className="logo"><span className="sq"><i/><i/><i/><i/></span> GridFlow</div>
}

export default function Login() {
  const { signIn, signUp } = useAuth()
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
  return (
    <div className="auth-wrap"><form className="auth-card" onSubmit={submit}>
      <Logo />
      <h1>{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
      <p className="sub">Fast sheets, live database</p>
      {!isConfigured && <div className="notice">Add your Supabase key in <code>.env</code> and restart.</div>}
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
