# PG-Git (Local GitHub) — Specification

> **Author**: Antigravity
> **Date**: 2026-04-28
> **Status**: Draft | Review

---

## 1. What Is This?

A local-first version control and repository management system ("local github") where the repository data (files, commits, history, and branches) is stored natively inside a PostgreSQL database rather than in traditional `.git` directories on disk. This architecture allows the repository to be easily accessible from anywhere without relying on filesystem-level git synchronizations, leveraging the homelab's central database for persistence and distribution.

## 2. User Stories

- As a developer, I want to create a new repository that is entirely backed by PostgreSQL.
- As a developer, I want to commit and sync file changes directly to the database so I can access my codebase from any node in the homelab.
- As a user, I want a web-based dashboard (similar to GitHub) to visually browse the file tree, view commit history, and read code.

## 3. Core Features

| Feature | Priority | Notes |
|---------|----------|-------|
| **PostgreSQL VCS Schema** | Must-have | Tables for Repositories, Commits, Trees (directory structures), and Blobs (file contents). |
| **Storage API** | Must-have | REST/RPC API to commit files and retrieve the file tree at a specific commit. |
| **Web Dashboard** | Must-have | React+Vite frontend to browse repositories, view file contents (with syntax highlighting), and see commit history. |
| **Branching Support** | Nice-to-have | Basic support for `main` and other branches pointing to commit SHAs. |

## 4. Technical Constraints

- **Stack**: Node.js backend with ES Modules.
- **Frontend**: React + Vite (Vanilla CSS, adhering to the rigid T3 Code DBOS solid dark theme).
- **Database**: PostgreSQL (using `pgvector` enabled database).
- **Hosting**: Dockerized for standalone deployment via `docker-compose`.

## 5. Data Model

A Git-like directed acyclic graph (DAG) modeled in SQL:

```
Repository → has many → Branches (refs)
Branch → points to → Commit
Commit → points to → Tree (root directory) & Parent Commit
Tree → contains → TreeEntries (files/sub-trees)
TreeEntry → points to → Blob (actual file content) or another Tree
```

## 6. UI/UX 

- **Home Screen**: List of available repositories.
- **Repository View**: Shows the file tree for the latest commit, latest commit message, and standard "GitHub-like" header.
- **File View**: Displays file content with code syntax highlighting.
- **Commit History**: A timeline of commits.
- **Aesthetics**: Premium, modern, dark mode, vibrant colors, glassmorphism elements, micro-animations on hover.

## 7. Edge Cases & Gotchas

- [ ] How do we handle large file (binary) storage in PostgreSQL? (We might need size limits or storing them in a `bytea` or `text` column if small enough).
- [ ] Concurrency: Handling simultaneous commits to the same branch.
- [ ] Push/Pull mechanisms: Will there be a CLI tool to sync local disk files to the PG-Git database, or is it strictly edited through the web/API?

## 8. Acceptance Criteria

- [ ] Web UI is deployed and accessible.
- [ ] User can create a new repository.
- [ ] User can upload/commit files to the database.
- [ ] User can browse the file tree and read the code from the database.
- [ ] System uses `@krusch/toolkit` successfully.

## 9. Out of Scope

- Full Git protocol compatibility (e.g., you can't run `git clone` from the standard git CLI unless we build a full git server wrapper, which is out of scope for v1).
- Pull requests and advanced issue tracking.

## 10. Delivery Phases

| Phase | Scope | Acceptance |
|-------|-------|------------|
| 1 | DB Schema & API | Can programmatically insert and retrieve a file tree and commit. |
| 2 | Web Dashboard | Can visually browse the repository through the browser. |
| 3 | CLI/Sync Tool | A simple Node script to push a local folder to the PG-Git database. |
