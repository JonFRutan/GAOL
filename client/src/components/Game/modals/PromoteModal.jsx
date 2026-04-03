import '../GameScreen.css';

export default function PromoteModal({ target, revokeKey, setRevokeKey, onSubmit, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2 style={{ color: 'var(--tech-cyan)', borderColor: '#004d55' }}>TRANSFER ADMIN</h2>
        <p style={{ color: '#ccc', marginBottom: '15px', textAlign: 'center' }}>
          Are you sure you want to promote <b>{target}</b>?
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <input
            type="checkbox"
            id="revokeCheck"
            className="custom-checkbox"
            checked={revokeKey}
            onChange={e => setRevokeKey(e.target.checked)}
          />
          <label htmlFor="revokeCheck" style={{ color: '#888', fontSize: '0.9rem', cursor: 'pointer' }}>
            Revoke my API Key (New admin must provide one)
          </label>
        </div>
        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
          <button className="join-sm-btn" style={{ flex: 1, borderColor: '#333', color: '#555' }} onClick={onClose}>CANCEL</button>
          <button className="join-sm-btn" style={{ flex: 1, borderColor: 'var(--tech-cyan)', color: 'var(--tech-cyan)' }} onClick={onSubmit}>CONFIRM</button>
        </div>
      </div>
    </div>
  );
}
