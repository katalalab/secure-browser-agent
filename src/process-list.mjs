import { spawnSync } from 'node:child_process';

// `ps` does not exist on Windows. Five call sites used it directly, so daemon reuse, process
// reaping, the runtime audit and - worst - the secret audit all behaved as if the machine had
// no processes at all. A security audit that reports "nothing found" because it could not look
// is more dangerous than one that fails loudly, hence the explicit ok/unsupported distinction.

const WINDOWS_PS = [
  '-NoProfile',
  '-Command',
  // Tab-separated so the command line, which contains spaces and quotes, stays in one field.
  "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.CommandLine)\" }"
];

function parsePosix(stdout) {
  return String(stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) return null;
      return { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] };
    })
    .filter(Boolean);
}

function parseWindows(stdout) {
  return String(stdout || '')
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter(Boolean)
    .map((line) => {
      const [pid, ppid, ...rest] = line.split('\t');
      if (!/^\d+$/.test(String(pid).trim())) return null;
      // PID 0 is the System Idle Process; it is not something a caller can match or signal.
      if (Number(pid) === 0) return null;
      return {
        pid: Number(pid),
        ppid: Number(ppid) || 0,
        command: rest.join('\t').trim()
      };
    })
    .filter(Boolean);
}

/**
 * Returns { ok, processes, reason }. `ok:false` means the listing could not be taken - callers
 * must not read an empty `processes` array as "no such process is running".
 */
export function listProcesses({ timeoutMs = 15000 } = {}) {
  const windows = process.platform === 'win32';
  const result = windows
    ? spawnSync('powershell', WINDOWS_PS, { encoding: 'utf8', timeout: timeoutMs })
    : spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8', timeout: timeoutMs });

  if (result.error) return { ok: false, processes: [], reason: String(result.error.message || 'spawn failed') };
  if (result.status !== 0) return { ok: false, processes: [], reason: `exit ${result.status}` };
  return {
    ok: true,
    processes: windows ? parseWindows(result.stdout) : parsePosix(result.stdout),
    reason: ''
  };
}

/** Raw `pid command` lines, for callers that only substring-match a command line. */
export function listProcessCommandLines(options = {}) {
  const listing = listProcesses(options);
  return {
    ok: listing.ok,
    reason: listing.reason,
    text: listing.processes.map((item) => `${item.pid} ${item.command}`).join('\n')
  };
}
