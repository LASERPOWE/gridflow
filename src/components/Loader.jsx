// smartsheet-branded loading overlay. Shows on app start, view change, sheet switch.
export default function Loader({ show, label }) {
  return (
    <div className={'ss-loader' + (show ? ' on' : '')} aria-hidden={!show}>
      <div className="ss-loader-inner">
        <div className="ss-loader-mark">
          <svg width="34" height="34" viewBox="0 0 24 24">
            <rect x="1" y="1" width="22" height="22" rx="6" fill="#fff" />
            <path d="M6 12.5l3.5 3.5L18 7.5" stroke="#2f5bd6" strokeWidth="2.6" fill="none"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="ss-loader-name">smartsheet</div>
        <div className="ss-loader-by">by Laser Power</div>
        <div className="ss-loader-bar"><i /></div>
        {label && <div className="ss-loader-label">{label}</div>}
      </div>
    </div>
  )
}
