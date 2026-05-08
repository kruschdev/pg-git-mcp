# GEMINI_INFLIGHT — pg-git

> Last updated: 2026-05-06

## Active Environment & Nodes
- Primary target: `kruschdev`

## Currently Modifying
- `config/external_docs.json` — manifest for external documentation sync
- `scripts/sync_external_docs.js` — script to pull, chunk, and sync external documentation like `llms.txt`

## Fragile / Don't Touch
- `scripts/sync_to_pg.js` — Core functionality depends on symlink fixes applied earlier. 

## Active Background Processes
- Running `sync_to_pg.js` on the pg-git repository to update the local codebase snapshot.
- Ran semantic embedding for external `cloudflare-agents-docs` via `/sweetdreams` capable automated script.

## Last Session
- Fixed an `EISDIR` bug in `sync_to_pg.js` involving directory symlinks, imported Agent Skills from the Goose repo, and successfully implemented a fully automated external `llms.txt` pipeline for the homelab's `pg-git` memory.

## Open Questions
- None.

## Discovered Issues
- Massive >50,000 char documents were not chunked in `sync_to_pg.js`, which was resolved via chunking during download in the new sync script.

## Next Steps
- [ ] Add the execution of `sync_external_docs.js` into the formal `/sweetdreams` homelab workflow.
- [ ] Monitor background index generation.
