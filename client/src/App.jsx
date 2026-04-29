import React, { useState, useEffect } from 'react';
import './index.css';

function App() {
  const [repos, setRepos] = useState([]);
  const [activeRepo, setActiveRepo] = useState(null);
  const [tree, setTree] = useState([]);
  const [embedModel, setEmbedModel] = useState('nomic-embed-text');
  const [savingModel, setSavingModel] = useState(false);

  useEffect(() => {
    fetch('http://localhost:4890/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.ai && data.ai.embedModel) {
          setEmbedModel(data.ai.embedModel);
        }
      })
      .catch(err => console.error(err));

    fetch('http://localhost:4890/api/repos')
      .then(res => res.json())
      .then(data => setRepos(data))
      .catch(err => console.error(err));
  }, []);

  const handleSaveModel = async () => {
    setSavingModel(true);
    try {
      await fetch('http://localhost:4890/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai: { embedModel } })
      });
    } catch (err) {
      console.error(err);
    }
    setSavingModel(false);
  };

  useEffect(() => {
    if (activeRepo) {
      fetch(`http://localhost:4890/api/repos/${activeRepo.id}/tree`)
        .then(res => res.json())
        .then(data => setTree(data))
        .catch(err => console.error(err));
    }
  }, [activeRepo]);

  return (
    <div className="dbos-layout">
      {/* Sidebar - Explorer */}
      <div className="sidebar">
        <div className="sidebar-header">
          DBOS Explorer
        </div>
        <ul className="file-list" style={{ paddingTop: '10px' }}>
          {repos.length === 0 ? (
            <li className="file-item" style={{ color: 'var(--text-muted)' }}>No repositories</li>
          ) : (
            repos.map(repo => (
              <li 
                key={repo.id} 
                className={`file-item ${activeRepo?.id === repo.id ? 'active' : ''}`}
                onClick={() => setActiveRepo(repo)}
              >
                🗄️ {repo.name}
              </li>
            ))
          )}
        </ul>

        {/* Settings Panel */}
        <div className="sidebar-settings" style={{ padding: '15px', borderTop: '1px solid var(--border-color)', marginTop: 'auto' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-muted)' }}>AI SETTINGS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Embedding Model</label>
            <input 
              type="text" 
              value={embedModel} 
              onChange={(e) => setEmbedModel(e.target.value)}
              style={{ 
                background: 'var(--bg-secondary, #1e1e1e)', 
                border: '1px solid var(--border-color)', 
                color: 'var(--text-main, #ccc)', 
                padding: '6px 8px',
                borderRadius: '4px',
                fontSize: '0.8rem',
                outline: 'none'
              }}
            />
            <button 
              onClick={handleSaveModel}
              disabled={savingModel}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                padding: '6px 8px',
                borderRadius: '4px',
                cursor: savingModel ? 'not-allowed' : 'pointer',
                fontSize: '0.8rem',
                marginTop: '4px',
                fontWeight: '600',
                opacity: savingModel ? 0.7 : 1
              }}
            >
              {savingModel ? 'Saving...' : 'Save Model'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Two Editor Groups */}
      <div className="main-content">
        
        {/* Editor Group 1: Tree View */}
        <div className="editor-tab-container">
          <div className="tabs-header">
            <div className="tab active">
              {activeRepo ? `${activeRepo.name} - Tree` : 'Tree View'}
            </div>
          </div>
          <div className="tab-content">
            {activeRepo ? (
              <ul className="file-list" style={{ padding: 0 }}>
                {tree.map((item, idx) => (
                  <li key={idx} className="file-item">
                    {item.type === 'tree' ? '📁' : '📄'} {item.name}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Select a repository to view tree</div>
            )}
          </div>
        </div>

        {/* Editor Group 2: File Content */}
        <div className="editor-tab-container">
          <div className="tabs-header">
            <div className="tab active">
              Code Viewer
            </div>
          </div>
          <div className="tab-content">
            <div className="code-block">
              {`// DBOS System File Viewer\n// Awaiting file selection from the tree\n\nfunction bootSequence() {\n  System.log("PG-Git operational");\n}`}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
