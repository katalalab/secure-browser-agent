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
// `Set-Cookie:` is one pair plus non-secret attributes (Path, HttpOnly), so redaction
// stops at the first `;`. A request `Cookie:` header is a `;`-separated list where every
// pair is a secret — stopping at the first `;` there leaves the rest of the pairs visible.
const LOG_SET_COOKIE = /(?<![\w.-])((?:[\w.-]*[_.-])?set-cookie\s*[=:]\s*)[^\s;]+/gi;
const LOG_REQUEST_COOKIE = /(?<![\w.-])(cookie\s*[=:]\s*)[^\r\n]+/gi;
// Non-cookie secrets may legitimately contain `;` (`password=alpha;bravo`), so they run to
// whitespace. `code`/`key` compounds need a secret-bearing prefix so `exit_code=1` and
// `foreign_key=id` survive, while `x-api-key` and `mfa_code` still redact; the bare forms
// stay in because a lone `code=`/`key=` is more often an OAuth code than a diagnostic.
const LOG_SECRET_ASSIGNMENT = /(?<![\w.-])((?:(?:[\w.-]*[_.-])?(?:authorization|password|passwd|session|secret|token|auth|otp)|(?:[\w.-]*[_.-])?(?:api|access|secret|private|signing|encryption|auth|refresh|mfa|otp|verification|activation|recovery|invite)[_.-](?:code|key)|(?:code|key))\s*[=:]\s*)(?:(?:bearer|basic)\s+)?[^\s&]+/gi;
// Deliberately fail closed: a length or shape gate here lets `Basic abc` and other short
// credentials through, and losing the word after `basic` in prose costs only readability.
const LOG_AUTH_SCHEME = /\b(bearer|basic)\s+[a-z0-9._~+/=-]+/gi;

export function sanitizeLogLine(line) {
  return String(line || '')
    .replace(LOG_SET_COOKIE, '$1[redacted]')
    .replace(LOG_REQUEST_COOKIE, '$1[redacted]')
    .replace(LOG_SECRET_ASSIGNMENT, '$1[redacted]')
    .replace(LOG_AUTH_SCHEME, '$1 [redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

// Separators carry no meaning in a key name, but substring matching treated them as
// significant: with 'api_key' in the list, the keys 'api-key' and 'x-api-key' both
// passed through with their values intact. Header-style names are exactly what browser
// and API responses use, so the miss landed on the common case rather than an edge one.
// The default list itself mixes 'set-cookie', 'api_key' and 'apiKey', which is the same
// observation from the other side.
function keyShape(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function redact(value, policy) {
  const keys = policy.redactKeys || [];
  const needles = keys.map(keyShape).filter(Boolean);
  const visit = (input, key = '') => {
    if (needles.some((needle) => keyShape(key).includes(needle))) {
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
