// Kill a spawned `vite preview` server AND its descendants.
//
// Every test script starts its preview server with
// `spawn('npx', [...], { shell: true })`. On Windows that produces a chain:
//
//     cmd.exe  ->  npx-cli.js (node)  ->  vite.js (node, the actual server)
//
// `child.kill()` signals only the head of that chain. The real vite process
// is a *grandchild* and survives, holding its port and its memory. A full
// 19-suite run therefore used to leave ~19 orphaned preview servers behind,
// which is also why an earlier "the suites are fixed" claim was only half
// true: `process.exit(0)` stopped the runner from HANGING on those handles,
// but nothing ever reaped the processes themselves.
//
// `taskkill /T` walks the tree and `/F` forces it, which is the only
// reliable way to reap the chain on Windows. POSIX gets a process-group
// kill for the same reason.

import { spawnSync } from 'node:child_process';

export function killTree(child) {
  if (!child || child.killed || child.pid == null) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      // negative pid = the whole process group (requires detached: true at spawn)
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    }
  } catch {
    // last resort — better a leaked process than a crashed teardown
    try { child.kill(); } catch { /* ignore */ }
  }
}
