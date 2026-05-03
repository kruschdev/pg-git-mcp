import React, { useState, useEffect } from 'react';
import './index.css';

const API_BASE = '';  // Use relative URLs — works with Vite proxy in dev and express.static in prod

function App() {
  const [repos, setRepos] = useState([]);
  const [activeRepo, setActiveRepo] = useState(null);
  const [tree, setTree] = useState([]);
  const [blobContent, setBlobContent] = useState(null);
  const [activeBlobName, setActiveBlobName] = useState(null);
  const [embedModel, setEmbedModel] = useState('nomic-embed-text');
  const [savingModel, setSavingModel] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/config`)
      .then(res => res.json())
      .then(data => {
        if (data.ai && data.ai.embedModel) {
          setEmbedModel(data.ai.embedModel);
        }
      })
      .catch(err => setError(`Failed to load config: ${err.message}`));

    fetch(`${API_BASE}/api/repos`)
      .then(res => res.json())
      .then(data => setRepos(data))
      .catch(err => setError(`Failed to load repos: ${err.message}`));
  }, []);

  useEffect(() => {
    if (activeRepo) {
      setTree([]);
      setBlobContent(null);
      setActiveBlobName(null);
      fetch(`${API_BASE}/api/repos/${activeRepo.id}/tree`)
        .then(res => res.json())
        .then(data => setTree(data))
        .catch(err => setError(`Failed to load tree: ${err.message}`));
    }
  }, [activeRepo]);

  const handleBlobClick = async (item) => {
    if (item.type !== 'blob') return;
    try {
      const res = await fetch(`${API_BASE}/api/blobs/${item.object_id}`);
      const data = await res.json();
      setBlobContent(data.content);
      setActiveBlobName(item.name);
    } catch (err) {
      setError(`Failed to load file: ${err.message}`);
    }
  };

  return (
    <div className="dbos-layout">
      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          ⚠️ {error} <span style={{ cursor: 'pointer', marginLeft: '8px' }}>×</span>
        </div>
      )}

      {/* Sidebar - Explorer */}
      <div className="sidebar">
        <div className="sidebar-header">
          PG-Git Explorer
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
                  <li 
                    key={idx} 
                    className={`file-item ${activeBlobName === item.name ? 'active' : ''}`}
                    onClick={() => handleBlobClick(item)}
                    style={{ cursor: item.type === 'blob' ? 'pointer' : 'default' }}
                  >
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
              {activeBlobName || 'Code Viewer'}
            </div>
          </div>
          <div className="tab-content">
            <div className="code-block">
              {blobContent || `// PG-Git Code Viewer\n// Select a file from the tree to view its contents`}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
