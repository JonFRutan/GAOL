import './WorldSheet.css';

export default function WorldSheet({ worldData, worldTab, setWorldTab }) {
  if (!worldData) return <div>Loading world data...</div>;

  const tabs = ['history', 'locations', 'figures', 'factions', 'biology'];

  // figures are characters & deities
  const figures = [
    ...(worldData.characters || []).map(c => ({
      name: c.name, title: c.role || 'Character', desc: c.description, aff: c.affiliation, status: c.status
    }))
  ];

  return (
    <div className="world-sheet">
      <div className="world-header">
        <h2>{worldData.name}</h2>
        <div className="world-meta">
          <span>{worldData.setting}</span> | <span>{worldData.realism} Realism</span>
        </div>
      </div>

      <div className="map-placeholder">
        <div className="map-text">HIC SUNT DRACONES</div>
        <div className="map-subtext">(Territory Uncharted)</div>
      </div>

      <div className="sub-tab-bar">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`sub-tab-btn ${worldTab === tab ? 'active' : ''}`}
            onClick={() => setWorldTab(tab)}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="world-events-list">
        {worldTab === 'history' && (
          worldData.major_events?.length > 0
            ? worldData.major_events.map((e, i) => (
                <div key={i} className="entity-item">
                  <div className="entity-name">{typeof e === 'string' ? 'Event Log' : e.title}</div>
                  <div className="entity-type">History</div>
                  <div className="entity-desc">{typeof e === 'string' ? e : e.description}</div>
                </div>
              ))
            : <div className="empty-text">No major history yet.</div>
        )}

        {worldTab === 'locations' && (
          worldData.locations?.length > 0
            ? worldData.locations.map((e, i) => (
                <div key={i} className="entity-item">
                  <div className="entity-name">{e.name}</div>
                  <div className="entity-type">{e.type}</div>
                  <div className="entity-desc">{e.description}</div>
                  <div className="entity-meta">
                    Coordinates: {e.x}, {e.y} | Size: {e.radius} | Controlled by: {e.affiliation || 'Independent'}
                  </div>
                </div>
              ))
            : <div className="empty-text">No known locations.</div>
        )}

        {worldTab === 'figures' && (
          figures.length > 0
            ? figures.map((e, i) => (
                <div key={i} className="entity-item">
                  <div className="entity-name">{e.name}</div>
                  <div className="entity-type">{e.title}</div>
                  <div className="entity-desc">{e.desc}</div>
                  {e.aff && <div className="entity-meta">Affiliation: {e.aff}</div>}
                </div>
              ))
            : <div className="empty-text">No major figures known.</div>
        )}

        {worldTab === 'factions' && (
          worldData.groups?.length > 0
            ? worldData.groups.map((e, i) => (
                <div key={i} className="entity-item">
                  <div className="entity-name">{e.name}</div>
                  <div className="entity-type">{e.type}</div>
                  <div className="entity-desc">{e.description}</div>
                </div>
              ))
            : <div className="empty-text">No major factions known.</div>
        )}

        {worldTab === 'biology' && (
          worldData.biology?.length > 0
            ? worldData.biology.map((e, i) => (
                <div key={i} className="entity-item">
                  <div className="entity-name">{e.name}</div>
                  {e.disposition && <div className="entity-disposition">Disposition: {e.disposition}</div>}
                  <div className="entity-desc">{e.description}</div>
                  <div className="entity-type">Habitat: {e.habitat}</div>
                </div>
              ))
            : <div className="empty-text">No known biology.</div>
        )}
      </div>
    </div>
  );
}
