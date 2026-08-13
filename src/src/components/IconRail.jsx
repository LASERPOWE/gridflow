// Citrix-style vertical icon rail (leftmost). Icons: Home, Notifications, Search,
// Browse, Recents, Favorites, Resource Mgmt, WorkApps, Create + bottom apps/help/profile.
function Item({ icon, label, active, badge, onClick }) {
  return (
    <button className={'rail-item' + (active ? ' active' : '')} onClick={onClick} title={label}>
      <span className="rail-ico">{icon}
        {badge ? <span className="rail-badge">{badge}</span> : null}
      </span>
      <span className="rail-label">{label}</span>
    </button>
  )
}

export default function IconRail({ view, onView, onCreate, initials }) {
  return (
    <nav className="rail">
      <div className="rail-top">
        <Item icon="🏠" label="Home"        active={view === 'home'}   onClick={() => onView('home')} />
        <Item icon="🔔" label="Notifications" badge={2}                 onClick={() => onView('home')} />
        <Item icon="🔍" label="Search"      active={view === 'search'} onClick={() => onView('search')} />
        <Item icon="🗂" label="Browse"      active={view === 'browse'} onClick={() => onView('browse')} />
        <Item icon="🕘" label="Recents"     onClick={() => onView('browse')} />
        <Item icon="⭐" label="Favorites"   onClick={() => onView('browse')} />
        <Item icon="🧩" label="Resource Management" onClick={() => onView('browse')} />
        <Item icon="🧱" label="WorkApps"    onClick={() => onView('browse')} />
        <Item icon="➕" label="Create"      onClick={onCreate} />
      </div>
      <div className="rail-bottom">
        <Item icon="▦" label="Apps"  onClick={() => onView('browse')} />
        <Item icon="❔" label="Help"  onClick={() => onView('home')} />
        <button className="rail-avatar" title="Profile">{initials || 'U'}</button>
      </div>
    </nav>
  )
}
