import fs from 'node:fs';
import path from 'node:path';
import { cdpDaemonStatus } from './cdp-backend.mjs';
import { loadPolicy, profilePath } from './policy.mjs';
import { doctorTargetPack, resolveTargetAutostart, resolveTargetPack, resolveTargetPermissions, targetAutostartStatus, targetPermissionStatus } from './target-pack.mjs';
import { profileStatus } from './profile-status.mjs';

const CONFIG_EXTENSIONS = new Set(['.json', '.md', '.plist', '.txt']);
const SKIP_DIRS = new Set(['profiles', 'outputs']);
const MAX_SCAN_BYTES = 128 * 1024;

const SECRET_PATTERNS = [
  { name: 'authorization-header', regex: /\b(?:bearer|basic)\s+[a-z0-9._~+/=-]{12,}/i },
  { name: 'private-key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'github-token', regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { name: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: 'openai-key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'url-userinfo', regex: /https?:\/\/[^/\s:@]+:[^/\s:@]+@/i }
];

const SENSITIVE_KEY = /^(?:authorization|cookie|set-cookie|password|passwd|token|secret|api[_-]?key|apikey|client_secret|refresh_token|access_token)$/i;

function inside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function check(level, name, ok, detail = '') {
  return { level: ok ? 'pass' : level, name, ok, detail };
}

function configFiles(rootDir) {
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!CONFIG_EXTENSIONS.has(path.extname(entry.name))) continue;
      const stat = fs.statSync(fullPath);
      if (stat.size <= MAX_SCAN_BYTES) files.push(fullPath);
    }
  };
  visit(rootDir);
  return files;
}

function lineForOffset(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function scanText(file, text, rootDir) {
  const findings = [];
  for (const pattern of SECRET_PATTERNS) {
    const match = pattern.regex.exec(text);
    if (!match) continue;
    findings.push({
      file: path.relative(rootDir, file),
      rule: pattern.name,
      line: lineForOffset(text, match.index),
      sample: '[REDACTED_MATCH]'
    });
  }
  return findings;
}

function valuePresent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '' && value !== '[REDACTED]';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function scanJsonValue(value, file, rootDir, jsonPath = '$') {
  if (!value || typeof value !== 'object') return [];
  const findings = [];
  for (const [key, next] of Object.entries(value)) {
    const nextPath = `${jsonPath}.${key}`;
    if (SENSITIVE_KEY.test(key) && valuePresent(next)) {
      findings.push({
        file: path.relative(rootDir, file),
        rule: 'sensitive-json-key',
        path: nextPath,
        key,
        valueShape: Array.isArray(next) ? 'array' : typeof next
      });
      continue;
    }
    if (next && typeof next === 'object') {
      findings.push(...scanJsonValue(next, file, rootDir, nextPath));
    }
  }
  return findings;
}

export function scanTargetPackForSecrets(targetDir) {
  const rootDir = path.resolve(targetDir);
  const findings = [];
  for (const file of configFiles(rootDir)) {
    const text = fs.readFileSync(file, 'utf8');
    findings.push(...scanText(file, text, rootDir));
    if (path.extname(file) === '.json') {
      try {
        findings.push(...scanJsonValue(JSON.parse(text), file, rootDir));
      } catch {
        findings.push({
          file: path.relative(rootDir, file),
          rule: 'invalid-json',
          sample: '[PARSE_FAILED]'
        });
      }
    }
  }
  return findings;
}

export async function auditTargetPack(targetDir, options = {}) {
  const pack = resolveTargetPack(targetDir);
  const policy = loadPolicy(pack.policy);
  const targetProfile = options.profile || pack.metadata.profile || pack.targetPolicy.defaultProfile || pack.metadata.target || path.basename(pack.dir);
  const targetProfilePath = profilePath(policy, targetProfile);
  const doctor = doctorTargetPack(pack.dir);
  const permissionsPlan = resolveTargetPermissions(pack.dir, 'status', options);
  const permissions = targetPermissionStatus(permissionsPlan, targetProfilePath);
  const daemon = await cdpDaemonStatus(targetProfilePath);
  const autostartPlan = resolveTargetAutostart(pack.dir, 'status', options);
  const autostart = targetAutostartStatus(autostartPlan, options);
  const profile = profileStatus(policy, targetProfile);
  const secretFindings = scanTargetPackForSecrets(pack.dir);
  const profileDirScoped = inside(path.resolve(policy.profileDir), pack.dir);
  const outputDirScoped = inside(path.resolve(policy.outputDir), pack.dir);
  const authenticatedEngines = pack.targetPolicy.authenticatedEngines || [];
  const authenticatedChromeOnly = authenticatedEngines.length === 1 && authenticatedEngines[0] === 'chrome';
  const normalChromeProfile = path.join(process.env.HOME || '', 'Library', 'Application Support', 'Google', 'Chrome');

  const checks = [
    check('error', 'target.doctor', doctor.ok, doctor.ok ? 'target pack checks pass' : 'target pack doctor failed'),
    check('error', 'policy.profileDirScoped', profileDirScoped, policy.profileDir),
    check('error', 'policy.outputDirScoped', outputDirScoped, policy.outputDir),
    check('error', 'policy.authenticatedChromeOnly', authenticatedChromeOnly, authenticatedEngines.join(',') || 'missing'),
    check('error', 'profile.notNormalChromeProfile', !inside(path.resolve(targetProfilePath), normalChromeProfile), targetProfilePath),
    check('warn', 'permissions.applied', permissions.pending === 0, `${permissions.applied} applied, ${permissions.pending} pending`),
    check('error', 'secrets.configFilesClean', secretFindings.length === 0, `${secretFindings.length} finding(s)`),
    check('info', 'daemon.status', true, daemon.ok ? `running pid=${daemon.pid}` : 'not running'),
    check('info', 'autostart.status', true, autostart.loaded ? 'loaded' : 'not loaded')
  ];

  return {
    ok: checks.every((item) => item.ok || item.level !== 'error'),
    target: pack.metadata.target || targetProfile,
    dir: pack.dir,
    policy: pack.policy,
    profile,
    permissions,
    daemon,
    autostart: {
      label: autostart.label,
      installed: autostart.installed,
      loaded: autostart.loaded,
      serviceTarget: autostart.serviceTarget,
      launchctl: autostart.launchctl
    },
    secrets: {
      scannedFiles: configFiles(pack.dir).map((file) => path.relative(pack.dir, file)),
      findings: secretFindings
    },
    checks
  };
}
