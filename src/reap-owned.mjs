import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listProcesses } from './process-list.mjs';

function readProcessTable() {
  const listing = listProcesses();
  // Throwing keeps the old contract: reaping must not silently decide there is nothing to reap.
  if (!listing.ok) throw new Error(`process listing failed: ${listing.reason}`);
  return listing.processes;
}

function readSessionPids(sessionNames) {
  const dir = path.join(os.homedir(), '.agent-browser');
  return sessionNames.flatMap((name) => {
    const pidFile = path.join(dir, `${name}.pid`);
    if (!fs.existsSync(pidFile)) return [];
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    return Number.isFinite(pid) ? [{ pid, reason: `agent-browser session ${name}`, session: name }] : [];
  });
}

export function planOwnedReap(policy, { includePublic = true } = {}) {
  const profileRoot = policy.profileDir;
  const profileNames = fs.existsSync(profileRoot)
    ? fs.readdirSync(profileRoot).filter((name) => {
      if (includePublic && name === 'public') return true;
      if (name === 'pw-probe') return true;
      return /^verify-\d+$/.test(name);
    })
    : [];
  const table = readProcessTable();
  const byPid = new Map(table.map((proc) => [proc.pid, proc]));

  const sessionTargets = readSessionPids(profileNames);
  const profileTargets = table
    .filter((proc) => proc.command.includes(profileRoot))
    .map((proc) => ({ pid: proc.pid, reason: 'process using secure-browser-agent profile', session: null }));

  const targets = new Map();
  for (const target of [...sessionTargets, ...profileTargets]) {
    const proc = byPid.get(target.pid);
    targets.set(target.pid, {
      ...target,
      command: proc?.command || '',
      ppid: proc?.ppid || null
    });
  }

  const verifyProfiles = profileNames
    .filter((name) => /^verify-\d+$/.test(name))
    .map((name) => path.join(profileRoot, name));

  return {
    profileRoot,
    profileNames,
    processTargets: Array.from(targets.values()).sort((a, b) => a.pid - b.pid),
    verifyProfiles
  };
}

export function applyOwnedReap(plan) {
  const killed = [];
  for (const target of plan.processTargets) {
    try {
      process.kill(target.pid, 'SIGTERM');
      killed.push(target.pid);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  for (const dir of plan.verifyProfiles) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { killed, removedProfiles: plan.verifyProfiles };
}
