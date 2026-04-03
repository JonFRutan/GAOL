import '../GameScreen.css';

const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

export default function ModelModal({ currentModel, onChange, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2 style={{ color: '#b080ff', borderColor: '#3a2a55' }}>NEURAL SHIFT</h2>
        <p className="modal-subtitle">Select the active intelligence model.</p>

        <div className="model-list">
          {MODELS.map(m => (
            <button
              key={m}
              className={`model-option-btn ${currentModel === m ? 'active' : ''}`}
              onClick={() => onChange(m)}
            >
              <span>{m}</span>
              {currentModel === m && <span style={{ color: '#b080ff' }}>●</span>}
            </button>
          ))}
        </div>

        <button className="join-sm-btn" style={{ width: '100%', marginTop: '20px', borderColor: '#333', color: '#555' }} onClick={onClose}>
          CANCEL
        </button>
      </div>
    </div>
  );
}
