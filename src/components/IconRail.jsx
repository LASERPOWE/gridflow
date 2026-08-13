// Smartsheet-style vertical icon rail.
function Item({ icon, label, active, badge, onClick }) {
  return (
    <button className={'rail-item' + (active ? ' active' : '')} onClick={onClick} title={label}>
      <span className="rail-ico">{icon}{badge ? <span className="rail-badge">{badge}</span> : null}</span>
      <span className="rail-label">{label}</span>
    </button>
  )
}

export default function IconRail({ view, onView, onCreate, onSearch, initials }) {
  return (
    <nav className="rail">
      <div className="rail-top">
        <div className="rail-brand" title="smartsheet by Laser Power">
          <svg width="20" height="20" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="5" fill="#fff"/><path d="M6 12.5l3.5 3.5L18 7.5" stroke="#2f5bd6" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <Item icon="🏠" label="Home" active={view === 'home'} onClick={() => onView('home')} />
        <Item icon="🔔" label="Notifications" badge={2} onClick={() => onView('home')} />
        <Item icon="🔍" label="Search" onClick={onSearch} />
        <Item icon="🗂" label="Browse" active={view === 'browse'} onClick={() => onView('browse')} />
        <Item icon="🕘" label="Recents" onClick={() => onView('browse')} />
        <Item icon="⭐" label="Favorites" onClick={() => onView('browse')} />
        <Item icon="🧩" label="Resource Management" onClick={() => onView('browse')} />
        <Item icon="🧱" label="WorkApps" onClick={() => onView('browse')} />
        <Item icon="➕" label="Create" onClick={onCreate} />
      </div>
      <div className="rail-bottom">
        <Item icon="▦" label="Apps" onClick={() => onView('browse')} />
        <Item icon="❔" label="Help" onClick={() => onView('home')} />
        <button className="rail-avatar" title="Profile">{initials || 'U'}</button>
      </div>
    </nav>
  )
}
