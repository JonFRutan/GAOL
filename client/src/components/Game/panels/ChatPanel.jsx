import './ChatPanel.css';

export default function ChatPanel({
  messages, statusMsg, worldName, isAdmin, isEmbarking, isFinale,
  isLockedIn, allPlayersReady, nonSystemMessages, lastRoll,
  actionInput, setActionInput, onEmbark, onSendAction, chatEndRef
}) {
  return (
    <div className="left-panel">
      <div className={`status-ticker ${statusMsg.includes('THINKING') ? 'thinking' : ''}`}>
        STATUS: {statusMsg} | WORLD: {worldName}
      </div>

      <div className="chat-window">
        {/* Embark button (admin pre-game) */}
        {nonSystemMessages.length === 0 && isAdmin && !isEmbarking && (
          <div className="embark-overlay">
            <button
              className="embark-btn"
              onClick={onEmbark}
              disabled={!allPlayersReady}
              style={{ opacity: allPlayersReady ? 1 : 0.5, cursor: allPlayersReady ? 'pointer' : 'not-allowed' }}
            >
              {allPlayersReady ? 'EMBARK' : 'WAITING FOR PLAYERS...'}
            </button>
          </div>
        )}

        {/* Waiting text (non-admin) */}
        {nonSystemMessages.length === 0 && !isAdmin && (
          <div className="embark-overlay">
            <div style={{ color: '#666', fontStyle: 'italic' }}>
              {isLockedIn ? 'Waiting for host to start...' : 'Fill out character sheet...'}
            </div>
          </div>
        )}

        {/* Chat history */}
        {messages.map((m, i) => (
          <div key={i} className={`message-block ${m.sender === 'GAOL' ? 'gaol-msg' : 'player-msg'}`}>
            <div className="msg-header">
              {m.sender === 'GAOL' ? 'GAOL:' : m.sender === 'System' ? 'SYS:' : 'Actions:'}
            </div>
            <div
              className="msg-body"
              style={{ color: m.sender === 'System' ? '#555' : 'inherit', fontStyle: m.sender === 'System' ? 'italic' : 'normal' }}
            >
              {m.sender !== 'GAOL' && m.sender !== 'System' && (
                <span className="player-name">{m.sender}<br /></span>
              )}
              <span dangerouslySetInnerHTML={{ __html: m.text }} />
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="input-area">
        <span className="prompt-arrow">{'>'}</span>
        <input
          value={actionInput}
          onChange={e => setActionInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSendAction()}
          placeholder={!isFinale ? 'Describe your action...' : 'Campaign has ended.'}
          disabled={nonSystemMessages.length === 0 || isFinale}
        />
        <div className="dice-display">
          <div className="dice-label">D20</div>
          <div className={`dice-value ${lastRoll === 20 ? 'crit-success' : lastRoll === 1 ? 'crit-fail' : ''}`}>
            {lastRoll !== null ? lastRoll : '-'}
          </div>
        </div>
      </div>
    </div>
  );
}
