#!/usr/bin/env node

/**
 * Scaffold nesting doll workflows for all active projects.
 * Creates close.md, continue.md, and commit.md (if project has own git remote).
 * Skips projects that already have up-to-date workflows (contain 'pg-git').
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const PROJECTS_DIR = '/home/kruschdev/homelab/projects';
const PG_GIT_SYNC = 'node /home/kruschdev/homelab/projects/pg-git/scripts/sync_to_pg.js';

// Active projects from sync_all_projects.js + sentinel
const ACTIVE_PROJECTS = [
  'annotated', 'berean', 'caren', 'first-things-first', 'heyjb',
  'hivemind-companion-ext', 'home-ai', 'krusch-dbos-mcp', 'krusch-agentic-mcp',
  'krusch-infra-mcp', 'krusch-ide', 'lightmind', 'money-machine',
  'perkins_snow_removal', 'pocket-lawyer', 'pocket-lawyer-marketing',
  'roughin-suite', 'signet', 'spark', 'krusch-sentinel-mcp'
];

// Already scaffolded
const SKIP = new Set(['pg-git', 'krusch-memory-mcp']);

function hasOwnGitRemote(projPath) {
  try {
    if (!fs.existsSync(path.join(projPath, '.git'))) return null;
    const remote = execSync('git remote get-url origin 2>/dev/null', { cwd: projPath }).toString().trim();
    return remote || null;
  } catch { return null; }
}

function isAlreadyUpdated(projPath) {
  const closePath = path.join(projPath, '.agent/workflows/close.md');
  if (!fs.existsSync(closePath)) return false;
  return fs.readFileSync(closePath, 'utf-8').includes('pg-git');
}

function generateClose(name) {
  return `---
description: Pause ${name} and save semantic state
---

# /close — ${name}

## Steps

1. **Semantic Snapshot**:
   \`\`\`bash
   ${PG_GIT_SYNC} /home/kruschdev/homelab/projects/${name}
   \`\`\`

2. **Update GEMINI_INFLIGHT.md**:
   - Create or overwrite \`GEMINI_INFLIGHT.md\` in this project root.
   - Include Fragile files, concrete Next Steps, and any transient state.

3. **Log Activity**:
   - Execute \`mcp_homelab-memory_mcp_homelab-memory_add\` with \`category: 'activity'\` and content: \`[${name}] <description>\`.

4. **Save Steering Facts**:
   - Store any new patterns via \`mcp_nuggets-memory_remember\` with \`kind: 'project'\`, key prefixed \`${name}:\`.

5. **Summarize**: 
   > "Project state saved. See you next session."
`;
}

function generateContinue(name) {
  return `---
description: Resume ${name} development with project-scoped context
---

# /continue — ${name}

## Steps

1. **Context Load (Project-Scoped)**:
   - Read \`GEMINI_INFLIGHT.md\` in this project root.
   - Query \`mcp_homelab-memory_mcp_homelab-memory_search(category: 'activity', query: '${name}')\`.
   - Query \`mcp_homelab-memory_mcp_homelab-memory_search(category: 'lessons', query: '${name}')\`.
   - Query \`mcp_nuggets-memory_nudges(kinds: ['project', 'user'], query: '${name}')\`.
   - **Zero-Trust**: Execute \`pg_git_semantic_search(project: '${name}')\` to verify codebase state.

2. **Transient State Check**: Check \`GEMINI_INFLIGHT.md\` for any **Transient State** or **Fragile** blocks.

3. **Execution**: Generate \`task.md\` and begin work autonomously.
`;
}

function generateCommit(name, remote) {
  return `---
description: Commit ${name} changes and push to GitHub
---

# /commit — ${name}

> ${name} has its own git remote (\`${remote}\`) separate from the homelab monorepo.

## Steps

// turbo-all

0. **Session close gate** — Run this project's \`/close\` if not already done.

1. Check current state:
\`\`\`bash
git status
git diff --stat
\`\`\`

2. Review the actual changes:
\`\`\`bash
git diff
\`\`\`

3. Summarize what changed and why.

4. Suggest a conventional commit message using \`type(scope): description\`.

5. Wait for user approval.

6. **Semantic Sync**: Update pg-git embeddings for this project.
\`\`\`bash
${PG_GIT_SYNC} .
\`\`\`

7. Stage, commit, and push:
\`\`\`bash
git add -A
git commit -m "<approved message>"
git push origin main
\`\`\`
`;
}

// Main
let created = 0, skipped = 0, updated = 0;

for (const name of ACTIVE_PROJECTS) {
  if (SKIP.has(name)) { skipped++; continue; }
  
  const projPath = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(projPath)) {
    console.log(`⏭️  ${name} — directory not found, skipping`);
    skipped++;
    continue;
  }

  if (isAlreadyUpdated(projPath)) {
    console.log(`✅ ${name} — already up-to-date`);
    skipped++;
    continue;
  }

  const wfDir = path.join(projPath, '.agent/workflows');
  fs.mkdirSync(wfDir, { recursive: true });

  // Always create close + continue
  fs.writeFileSync(path.join(wfDir, 'close.md'), generateClose(name));
  fs.writeFileSync(path.join(wfDir, 'continue.md'), generateContinue(name));
  
  // Only create commit.md if project has own git remote
  const remote = hasOwnGitRemote(projPath);
  if (remote) {
    fs.writeFileSync(path.join(wfDir, 'commit.md'), generateCommit(name, remote));
    console.log(`📦 ${name} — close + continue + commit (remote: ${remote})`);
  } else {
    console.log(`📦 ${name} — close + continue (monorepo)`);
  }
  created++;
}

console.log(`\n✅ Done. Created: ${created}, Skipped: ${skipped}`);
