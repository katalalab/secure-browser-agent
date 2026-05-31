import fs from 'node:fs';
import path from 'node:path';
import { profilePath, statePath } from './policy.mjs';

function statSummary(filePath, kind) {
  if (!fs.existsSync(filePath)) {
    return { kind, path: filePath, exists: false };
  }
  const stat = fs.statSync(filePath);
  return {
    kind,
    path: filePath,
    exists: true,
    type: stat.isDirectory() ? 'directory' : 'file',
    bytes: stat.isFile() ? stat.size : 0,
    mtime: stat.mtime.toISOString()
  };
}

function newestMtime(artifacts) {
  const times = artifacts
    .filter((artifact) => artifact.exists && artifact.mtime)
    .map((artifact) => new Date(artifact.mtime).getTime())
    .filter(Number.isFinite);
  if (times.length === 0) return '';
  return new Date(Math.max(...times)).toISOString();
}

export function profileStatus(policy, profileName) {
  const profile = profilePath(policy, profileName);
  const artifacts = [
    statSummary(profile, 'profileDir'),
    statSummary(statePath(policy, profileName), 'stateJson'),
    statSummary(path.join(profile, 'Local State'), 'chromeLocalState'),
    statSummary(path.join(profile, 'Default', 'Preferences'), 'chromePreferences'),
    statSummary(path.join(profile, 'Default', 'Cookies'), 'chromeCookiesLegacy'),
    statSummary(path.join(profile, 'Default', 'Network', 'Cookies'), 'chromeCookies')
  ];
  const cookieArtifacts = artifacts.filter((artifact) => artifact.kind.includes('Cookies') && artifact.exists && artifact.bytes > 0);
  const stateArtifacts = artifacts.filter((artifact) => ['stateJson', 'chromeLocalState', 'chromePreferences'].includes(artifact.kind) && artifact.exists && (artifact.type === 'directory' || artifact.bytes > 0));
  const lastModifiedAt = newestMtime(artifacts);
  return {
    profile: profileName,
    profilePath: profile,
    statePath: statePath(policy, profileName),
    policy: policy.source,
    exists: artifacts[0].exists,
    likelyAuthenticated: cookieArtifacts.length > 0 || stateArtifacts.length > 0,
    lastModifiedAt,
    artifacts
  };
}
