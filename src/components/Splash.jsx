// Smartsheet-style loading splash: blue gradient, logo, animated bar.
export default function Splash() {
  return (
    <div className="splash">
      <div className="splash-inner">
        <div className="splash-logo">
          <span className="splash-mark">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <rect x="1" y="1" width="22" height="22" rx="5" fill="#fff"/>
              <path d="M6 12.5l3.5 3.5L18 7.5" stroke="#2f5bd6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className="splash-name">smartsheet</span>
        </div>
        <div className="splash-by">by Laser Power</div>
        <div className="splash-bar"><span/></div>
      </div>
    </div>
  )
}
