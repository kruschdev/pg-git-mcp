import React, { useState, useEffect } from 'react';
import './index.css';

function App() {
  const [repos, setRepos] = useState([]);
  const [activeRepo, setActiveRepo] = useState(null);
  const [tree, setTree] = useState([]);

  useEffect(() => {
    fetch('http://localhost:4890/api/repos')
      .then(res => res.json())
      .then(data => setRepos(data))
      .catch(err => console.error(err));
  }, []);

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
