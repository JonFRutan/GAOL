import './PartyGrid.css';

export default function PartyGrid({ party, selectedPlayer, username, isAdmin, nonSystemMessages, onSelectPlayer, onKick, onPromote }) {
  return (
    <div className="party-grid">
      {party.map((p, i) => (
        <div
          key={i}
          className={`mini-card ${p.name === selectedPlayer ? 'selected' : ''} ${p.name === username ? 'own-player' : ''}`}
          onClick={() => onSelectPlayer(p.name)}
        >
          <div className="mini-name">#{i + 1} {p.name}</div>
          <div className="mini-stat">HP: {p.hp}</div>
          <div className="mini-stat">{p.status}</div>

          {((nonSystemMessages.length === 0 && p.is_ready) || (nonSystemMessages.length > 0 && p.has_acted)) && (
            <div className="ready-indicator">READY</div>
          )}

          {isAdmin && p.name !== username && (
            <div className="card-admin-overlay">
              <button className="admin-control-btn promote" onClick={e => onPromote(p.name, e)} title="Promote to Admin">^</button>
              <button className="admin-control-btn kick" onClick={e => onKick(p.name, e)} title="Kick Player">x</button>
            </div>
          )}
        </div>
      ))}

      {/* Empty slots */}
      {[...Array(Math.max(0, 6 - party.length))].map((_, i) => (
        <div key={`empty-${i}`} className="mini-card empty">
          <span className="empty-slot">EMPTY</span>
        </div>
      ))}
    </div>
  );
}
