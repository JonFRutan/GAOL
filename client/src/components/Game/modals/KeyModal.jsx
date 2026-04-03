import { useState } from 'react';
import '../GameScreen.css';

export default function KeyModal({ onSubmit, onClose }) {
  const [key, setKey] = useState('');

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2 style={{ color: 'var(--tech-cyan)', borderColor: '#004d55' }}>API CONFIG</h2>
        <p className="modal-subtitle">Update the session API Key.</p>
        <input
          className="sheet-input"
          type="password"
          placeholder="New API Key..."
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSubmit(key)}
          style={{ textAlign: 'center', borderColor: 'var(--tech-cyan)', color: 'var(--tech-cyan)' }}
        />
        <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '20px' }}>
          <button className="join-sm-btn" style={{ flex: 1, borderColor: '#333', color: '#555' }} onClick={onClose}>CANCEL</button>
          <button className="join-sm-btn" style={{ flex: 1, borderColor: 'var(--tech-cyan)', color: 'var(--tech-cyan)' }} onClick={() => onSubmit(key)}>UPDATE</button>
        </div>
      </div>
    </div>
  );
}
