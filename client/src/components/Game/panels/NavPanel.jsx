import './NavPanel.css';

export default function NavPanel({ isAdmin, tts, onLeave, onFinale, setOverlay, overlayMode }) {
  return (
    <div className="nav-panel">
      <button className="nav-btn leave-btn" onClick={onLeave} title="Leave Room">LEAVE</button>

      <button
        className={`nav-btn ${tts.enabled ? 'active' : ''}`}
        onClick={() => tts.setEnabled(!tts.enabled)}
        title="Toggle Text-to-Speech"
        style={{ color: tts.enabled ? 'var(--terminal-green)' : '#555', borderColor: tts.enabled ? 'var(--terminal-green)' : '#333' }}
      >
        {tts.enabled ? 'TTS ON' : 'TTS OFF'}
      </button>

      <button
        className={`nav-btn ttsmod-btn ${overlayMode === 'voice' ? 'active' : ''}`}
        onClick={() => setOverlay('voice')}
        title="Voice Settings"
      >
        Modify TTS
      </button>

      {isAdmin && (
        <>
          <button className="nav-btn model-btn" onClick={() => setOverlay('model')} title="Change AI Model">MODEL</button>
          <button className="nav-btn key-btn" onClick={() => setOverlay('key')} title="Update API Key">KEY</button>
          <button className="nav-btn god-mode-btn" onClick={() => setOverlay('override')} title="God Mode">GOD</button>
        </>
      )}

      <button className="nav-btn end-game-btn" onClick={onFinale} title="End Game">End Game</button>
    </div>
  );
}
