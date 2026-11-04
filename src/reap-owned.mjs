import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listProcesses } from './process-list.mjs';
import { profilePath, profileSessionId, requireOwnedProfile } from './policy.mjs';

function readProcessTable() {
  const listing = listProcesses();
  // Throwing keeps the old contract: reaping must not silently decide there is nothing to reap.
  if (!listing.ok) throw new Error(`process listing failed: ${listing.reason}`);
  return listing.processes;
}

function readSessionPids(sessions, homeDir) {
  const dir = path.join(homeDir, '.agent-browser');
  return sessions.flatMap(({ name, id }) => {
    const pidFile = path.join(dir, `${id}.pid`);
    if (!fs.existsSync(pidFile)) return [];
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    return Number.isFinite(pid) ? [{ pid, reason: `agent-browser session ${name}`, session: name }] : [];
  });
}

export function planOwnedReap(policy, { includePublic = true, processTable, homeDir = os.homedir() } = {}) {
  const profileRoot = policy.profileDir;
  const namespace = path.dirname(profilePath(policy, 'public'));
  const profileNames = fs.existsSync(namespace)
    ? fs.readdirSync(namespace).filter((name) => {
      if (includePublic && name === 'public') return true;
      if (name === 'pw-probe') return true;
      return /^verify-\d+$/.test(name);
    }).filter((name) => { requireOwnedProfile(policy, name); return true; })
    : [];
  const table = processTable || readProcessTable();
  const byPid = new Map(table.map((proc) => [proc.pid, proc]));

  const sessions = profileNames.map((name) => ({ name, id: profileSessionId(policy, name) }));
  const sessionTargets = readSessionPids(sessions, homeDir).filter((target) => {
    const proc = byPid.get(target.pid);
    const id = profileSessionId(policy, target.session);
    return proc && proc.command.includes('agent-browser') && proc.command.includes(id);
  });
  const ownedPaths = profileNames.map((name) => requireOwnedProfile(policy, name));
  const profileTargets = table.flatMap((proc) => {
    const index = ownedPaths.findIndex((dir) => proc.command.includes(`--user-data-dir=${dir}`));
    return index < 0 ? [] : [{ pid: proc.pid, reason: 'process using secure-browser-agent profile', session: null, profile: profileNames[index] }];
  });

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
    .map((name) => requireOwnedProfile(policy, name));

  return {
    profileRoot,
    profileNames,
    processTargets: Array.from(targets.values()).sort((a, b) => a.pid - b.pid),
    verifyProfiles
  };
}

export function applyOwnedReap(plan) {
  const policy = { profileDir: plan.profileRoot };
  for (const name of plan.profileNames) requireOwnedProfile(policy, name);
  for (const dir of plan.verifyProfiles) {
    const name = path.basename(dir);
    if (!/^verify-\d+$/.test(name) || requireOwnedProfile(policy, name) !== dir) throw new Error('unowned profile in reap plan');
  }
  if (plan.processTargets.length) throw new Error('reap cannot safely verify live process identity; no changes made');
  if (plan.verifyProfiles.length) throw new Error('reap cannot prove profiles are unused; no changes made');
  return { killed: [], removedProfiles: [] };
}
