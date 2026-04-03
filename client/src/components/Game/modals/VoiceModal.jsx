import '../GameScreen.css';

export default function VoiceModal({ tts, onClose }) {
  const { config, setConfig, resetConfig, playTTS } = tts;

  const Slider = ({ label, value, min, max, onChange }) => (
    <div className="slider-row">
      <div className="slider-label"><span>{label}</span><span>{value}</span></div>
      <input type="range" min={min} max={max} value={value} onChange={onChange} className="terminal-range" />
    </div>
  );

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2 style={{ color: 'var(--terminal-green)', borderColor: '#004d00' }}>Configure SAM</h2>
        <p className="modal-subtitle">Configuring Software Automatic Mouth (S.A.M.)</p>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <Slider label="PITCH" value={220 - config.pitch} min={20} max={200}
            onChange={e => setConfig(prev => ({ ...prev, pitch: 220 - Number(e.target.value) }))} />
          <Slider label="SPEED" value={230 - config.speed} min={30} max={200}
            onChange={e => setConfig(prev => ({ ...prev, speed: 230 - Number(e.target.value) }))} />
          <Slider label="THROAT" value={config.throat} min={10} max={255}
            onChange={e => setConfig(prev => ({ ...prev, throat: Number(e.target.value) }))} />
          <Slider label="MOUTH" value={config.mouth} min={10} max={255}
            onChange={e => setConfig(prev => ({ ...prev, mouth: Number(e.target.value) }))} />
          <div style={{ borderBottom: '1px solid #333', margin: '5px 0' }} />
          <Slider label="VOLUME" value={config.volume} min={0} max={100}
            onChange={e => setConfig(prev => ({ ...prev, volume: Number(e.target.value) }))} />
        </div>

        <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '25px' }}>
          <button className="join-sm-btn" style={{ flex: 1, borderColor: '#555', color: '#888' }} onClick={resetConfig}>RESET</button>
          <button className="action-btn" style={{ flex: 1, marginTop: 0, background: 'var(--terminal-green)' }}
            onClick={() => { onClose(); playTTS('GAOL has spoken.'); }}>
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
}
