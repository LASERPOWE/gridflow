// Smartsheet-style vertical icon rail.
function Item({ icon, label, active, badge, onClick }) {
  return (
    <button className={'rail-item' + (active ? ' active' : '')} onClick={onClick} title={label}>
      <span className="rail-ico">{icon}{badge ? <span className="rail-badge">{badge}</span> : null}</span>
      <span className="rail-label">{label}</span>
    </button>
  )
}

export default function IconRail({ view, onView, onCreate, onSearch, onNotif, notifCount, initials, isAdmin, canWrite, onProfile }) {
  return (
    <nav className="rail">
      <div className="rail-top">
        <div className="rail-brand" title="smartsheet by Laser Power">
          <svg width="22" height="22" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="6" fill="#fff"/><path d="M6 12.5l3.5 3.5L18 7.5" stroke="#2f5bd6" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <Item icon="🏠" label="Home" active={view === 'home'} onClick={() => onView('home')} />
        <Item icon="🔔" label="Notifications" badge={notifCount || 0} onClick={onNotif} />
        <Item icon="🕘" label="Recents" active={view === 'recents'} onClick={() => onView('recents')} />
        <Item icon="⭐" label="Favorites" active={view === 'favorites'} onClick={() => onView('favorites')} />
        {canWrite && <Item icon="➕" label="Create" onClick={onCreate} />}
        {isAdmin && <Item icon="🛡" label="Admin" active={view === 'admin'} onClick={() => onView('admin')} />}
      </div>
      <div className="rail-bottom">
        <button className="rail-avatar" title="Profile" onClick={onProfile}>{initials || 'U'}</button>
      </div>
    </nav>
  )
}
