import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_POLICY_PATH = new URL('../config/example-policy.json', import.meta.url);

export function loadPolicy(policyPath = process.env.SBA_POLICY) {
  const source = policyPath ? path.resolve(policyPath) : fileURLToPath(DEFAULT_POLICY_PATH);
  const parsed = JSON.parse(fs.readFileSync(source, 'utf8'));
  const baseDir = path.dirname(source);
  return {
    ...parsed,
    source,
    baseDir,
    outputDir: path.resolve(baseDir, '..', parsed.outputDir || 'runs'),
    profileDir: path.resolve(baseDir, '..', parsed.profileDir || 'profiles')
  };
}

export function assertAllowedUrl(rawUrl, policy) {
  if (!rawUrl) return;
  if (rawUrl.startsWith('data:')) {
    if (policy.allowedOrigins.includes('data:')) return;
    throw new Error('blocked URL by policy: data:');
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    url = new URL(`https://${rawUrl}`);
  }

  const origin = url.origin;
  if (policy.allowedOrigins.includes(origin)) return;

  const wildcardMatch = policy.allowedOrigins.some((entry) => {
    if (!entry.startsWith('*.')) return false;
    const suffix = entry.slice(1);
    return url.hostname.endsWith(suffix);
  });
  if (wildcardMatch) return;

  throw new Error(`blocked URL by policy: ${origin}`);
}

export function profilePath(policy, profileName) {
  const safeName = String(profileName || policy.defaultProfile || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(policy.profileDir, safeName);
}

export function statePath(policy, profileName) {
  return path.join(profilePath(policy, profileName), 'state.json');
}

export function allowedDomains(policy) {
  return (policy.allowedOrigins || [])
    .filter((entry) => !entry.endsWith(':'))
    .map((entry) => {
      if (entry.startsWith('*.')) return entry;
      return new URL(entry).hostname;
    });
}

export function assertEngineAllowed(engine, profileName, policy) {
  const allowed = policy.allowedEngines || ['chrome'];
  if (!allowed.includes(engine)) {
    throw new Error(`blocked engine by policy: ${engine}`);
  }
  const authEngines = policy.authenticatedEngines || ['chrome'];
  if (profileName !== 'public' && !authEngines.includes(engine)) {
    throw new Error(`engine cannot use authenticated profiles by policy: ${engine}`);
  }
}

// Prefix `(?:[\w.-]*[_.-])?` catches `sba_session=` and `set-cookie:` while a bare
// suffix match such as `exitcode=` stays readable; the lookbehind stops the key from
// matching mid-word.
// Cookie values are `;`-delimited attribute lists so their redaction must stop at the
// first `;`, but every other secret may contain one (`password=alpha;bravo`) — sharing
// one value class leaks the tail of the secret, so the two cases are matched separately.
const LOG_COOKIE_ASSIGNMENT = /(?<![\w.-])((?:[\w.-]*[_.-])?cookie\s*[=:]\s*)[^\s;]+/gi;
// `code` and `key` are too broad to take an arbitrary prefix: `exit_code=1` and
// `foreign_key=id` are diagnostics the operator needs, so they only pair with prefixes
// that are themselves secret-bearing.
const LOG_SECRET_ASSIGNMENT = /(?<![\w.-])((?:(?:[\w.-]*[_.-])?(?:authorization|password|passwd|session|secret|token|auth|otp)|(?:(?:api|access|secret|private|signing|encryption|auth|refresh)[_.-])?(?:code|key))\s*[=:]\s*)(?:(?:bearer|basic)\s+)?[^\s&]+/gi;
// A real credential is long; requiring token length keeps `basic setup complete` and
// `Bearer process exited` readable instead of masking the word after the scheme.
const LOG_AUTH_SCHEME = /\b(bearer|basic)\s+(?:[a-z0-9._~+/=-]{16,})/gi;

export function sanitizeLogLine(line) {
  return String(line || '')
    .replace(LOG_COOKIE_ASSIGNMENT, '$1[redacted]')
    .replace(LOG_SECRET_ASSIGNMENT, '$1[redacted]')
    .replace(LOG_AUTH_SCHEME, '$1 [redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export function redact(value, policy) {
  const keys = policy.redactKeys || [];
  const visit = (input, key = '') => {
    if (keys.some((needle) => key.toLowerCase().includes(needle.toLowerCase()))) {
      return '[REDACTED]';
    }
    if (Array.isArray(input)) return input.map((item) => visit(item));
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([nextKey, nextValue]) => [nextKey, visit(nextValue, nextKey)]));
    }
    if (typeof input === 'string') {
      return input.replace(/(bearer|basic)\s+[a-z0-9._~+/=-]+/gi, '$1 [REDACTED]');
    }
    return input;
  };
  return visit(value);
}
