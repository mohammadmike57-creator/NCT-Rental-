// Builds the website with a Node heap sized to the machine it runs on.
// A fixed small cap made the build fail as the app grew; a cap above the real memory gets the
// build killed instead. So: 75% of the memory available (container limit, else system RAM),
// at least 384 MB and at most 2 GB. NODE_BUILD_HEAP_MB overrides it.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';

function containerLimitMb() {
  for (const f of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try {
      const v = readFileSync(f, 'utf8').trim();
      const n = Number(v);
      if (v !== 'max' && Number.isFinite(n) && n > 0 && n < 2 ** 50) return Math.floor(n / 1048576);
    } catch { /* not in a container, or no limit */ }
  }
  return null;
}

const available = Math.min(containerLimitMb() ?? Infinity, Math.floor(os.totalmem() / 1048576));
const heap = Number(process.env.NODE_BUILD_HEAP_MB) || Math.max(384, Math.min(2048, Math.floor(available * 0.75)));
console.log(`Building the website with a ${heap} MB heap (${available} MB available).`);

const r = spawnSync(process.execPath, [`--max-old-space-size=${heap}`, 'node_modules/vite/bin/vite.js', 'build', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
