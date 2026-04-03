import '../GameScreen.css';

export default function KickModal({ target, onConfirm, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2 style={{ color: 'var(--alert-red)', borderColor: '#330000' }}>KICK PLAYER</h2>
        <p style={{ color: '#ccc', marginBottom: '15px', textAlign: 'center' }}>
          Are you sure you want to remove <b>{target}</b> from the session?
        </p>
        <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '10px' }}>
          <button className="join-sm-btn" style={{ flex: 1, borderColor: '#333', color: '#555' }} onClick={onClose}>CANCEL</button>
          <button className="join-sm-btn" style={{ flex: 1, borderColor: 'var(--alert-red)', color: 'var(--alert-red)' }} onClick={onConfirm}>REMOVE</button>
        </div>
      </div>
    </div>
  );
}
