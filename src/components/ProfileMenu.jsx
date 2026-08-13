import { useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth.jsx'

// Smartsheet-style avatar dropdown. Subscription/billing intentionally omitted.
export default function ProfileMenu({ open, onClose, onAdmin, onSettings, onComingSoon, isAdmin }) {
  const ref = useRef()
  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, onClose])

  const { profile, role, signOut } = useAuth()
  if (!open) return null
  const email = profile?.email || ''
  const name = profile?.full_name || email

  const Item = ({ label, onClick, soon }) => (
    <button className="pm-item" onClick={() => { onClose(); (onClick || (() => onComingSoon(label)))() }}>
      {label}{soon && <span className="pm-soon">soon</span>}
    </button>
  )

  return (
    <div className="pm" ref={ref} role="menu">
      <div className="pm-head">
        <div className="pm-name">{name}</div>
        <div className="pm-role">{(role || 'viewer').replace(/_/g, ' ')}</div>
      </div>
      <div className="pm-sep" />
      {isAdmin && <Item label="Admin Center…" onClick={onAdmin} />}
      {isAdmin && <Item label="User Management…" onClick={onAdmin} />}
      {isAdmin && <Item label="Group Management…" soon />}
      {isAdmin && <div className="pm-sep" />}
      <Item label="Personal Settings…" onClick={onSettings} />
      <Item label="Apps & Integrations…" soon />
      <Item label="Personal Colors & Logo…" soon />
      <Item label="My Contacts…" soon />
      <div className="pm-sep" />
      <button className="pm-item pm-out" onClick={() => { onClose(); signOut() }}>
        Sign Out
        <span className="pm-email">{email}</span>
      </button>
    </div>
  )
}
