-- PostgreSQL Schema for PG-Git

CREATE TABLE IF NOT EXISTS repositories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commits (
    id VARCHAR(40) PRIMARY KEY, -- SHA1 hash
    repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    tree_id VARCHAR(40) NOT NULL,
    parent_id VARCHAR(40) REFERENCES commits(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    author VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS branches (
    id SERIAL PRIMARY KEY,
    repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    commit_id VARCHAR(40) REFERENCES commits(id) ON DELETE SET NULL,
    UNIQUE(repository_id, name)
);

CREATE TABLE IF NOT EXISTS trees (
    id VARCHAR(40) PRIMARY KEY,
    repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tree_entries (
    id SERIAL PRIMARY KEY,
    tree_id VARCHAR(40) REFERENCES trees(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL, -- 'blob' or 'tree'
    name VARCHAR(255) NOT NULL,
    object_id VARCHAR(40) NOT NULL, -- points to either a blob or a tree
    UNIQUE(tree_id, name)
);

CREATE TABLE IF NOT EXISTS blobs (
    id VARCHAR(40) PRIMARY KEY,
    repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    content BYTEA NOT NULL,
    size INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_commits_repo ON commits(repository_id);
CREATE INDEX IF NOT EXISTS idx_tree_entries_tree ON tree_entries(tree_id);

-- Semantic Embedding Extensions
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE blobs ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE blobs ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS blobs_embedding_idx ON blobs USING hnsw (embedding vector_cosine_ops);
