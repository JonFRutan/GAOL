import { useState } from 'react';
import '../GameScreen.css';

export default function OverrideModal({ onSubmit, onClose }) {
  const [text, setText] = useState('');

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2 style={{ color: 'var(--alert-red)', borderColor: '#330000' }}>GOD MODE</h2>
        <p className="modal-subtitle" style={{ textAlign: 'center' }}>
          Inject story overrides for the next turn.
        </p>
        <textarea
          className="override-textarea"
          placeholder="e.g. 'Force a dragon attack' or 'Make the chest a mimic'."
          value={text}
          onChange={e => setText(e.target.value)}
          style={{ width: '100%', height: '150px' }}
        />
        <div className="override-actions" style={{ width: '100%', marginTop: '15px' }}>
          <button className="ready-btn" style={{ flex: 1, background: '#333', color: '#888' }} onClick={onClose}>CANCEL</button>
          <button className="ready-btn" style={{ flex: 1, background: 'var(--alert-red)', color: '#000' }} onClick={() => onSubmit(text)}>INJECT</button>
        </div>
      </div>
    </div>
  );
}
