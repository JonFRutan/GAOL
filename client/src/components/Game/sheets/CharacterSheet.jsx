import './CharacterSheet.css';

export default function CharacterSheet({ displayedPlayer, isOwnSheet, isLockedIn, showPrompt, playerForm, setPlayerForm, worldData, onReady }) {
  return (
    <>
      <div className="detail-row">
        <div className="detail-header">
          <h2>{displayedPlayer.name}</h2>
          <div className="detail-stats">
            <div>Health: {displayedPlayer.hp} / 100</div>
            <div>Status: {displayedPlayer.status}</div>
          </div>
        </div>
        <div className="portrait-small">
          {worldData?.setting?.[0] || '?'}{worldData?.realism?.[0] || '?'}
        </div>
      </div>

      <div className={`sheet-columns ${showPrompt ? 'sheet-attention-glow' : ''}`}>
        <div className="sheet-left">
          <label className="sheet-label">CHARACTER SUMMARY</label>
          <textarea
            style={{ flexGrow: 1, resize: 'none' }}
            placeholder="Briefly describe your character..."
            value={isOwnSheet ? playerForm.description : (displayedPlayer.description || '')}
            onChange={e => isOwnSheet && setPlayerForm(prev => ({ ...prev, description: e.target.value }))}
            disabled={!isOwnSheet || isLockedIn}
          />
        </div>

        <div className="sheet-right">
          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label className="sheet-label">TAGS</label>
              <span className="input-instruction">{isOwnSheet ? 'Max 5' : ''}</span>
            </div>
            <input
              className="sheet-input"
              placeholder="e.g. Human, Warrior, Strong"
              value={isOwnSheet ? playerForm.tags : (displayedPlayer.tags?.join(', ') || '')}
              onChange={e => isOwnSheet && setPlayerForm(prev => ({ ...prev, tags: e.target.value }))}
              disabled={!isOwnSheet || isLockedIn}
            />
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label className="sheet-label">AMBITION</label>
            <input
              className="sheet-input"
              placeholder="e.g. Become King"
              value={isOwnSheet ? playerForm.ambition : (displayedPlayer.ambition || '')}
              onChange={e => isOwnSheet && setPlayerForm(prev => ({ ...prev, ambition: e.target.value }))}
              disabled={!isOwnSheet || isLockedIn}
            />
          </div>

          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <label className="sheet-label">SECRET</label>
            {isOwnSheet ? (
              <textarea
                className="secret-textarea"
                placeholder="Hidden info..."
                value={playerForm.secret}
                onChange={e => setPlayerForm(prev => ({ ...prev, secret: e.target.value }))}
                disabled={isLockedIn}
              />
            ) : (
              <div className="secret-mask">
                What secrets may {displayedPlayer.name} hold?
              </div>
            )}
          </div>

          {isOwnSheet && !isLockedIn && (
            <button className="ready-btn" onClick={onReady} style={{ width: '100%', padding: '10px' }}>
              CONFIRM & READY
            </button>
          )}
        </div>
      </div>
    </>
  );
}
