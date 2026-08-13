// Generic centered modal (coming-soon notices, small panels).
export default function SimpleModal({ title, onClose, children }) {
  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal req-modal" role="dialog">
        <div className="modal-head">
          <span>{title}</span>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </>
  )
}
