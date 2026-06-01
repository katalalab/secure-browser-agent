import fs from 'node:fs';
import path from 'node:path';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compactValue(value) {
  if (value === undefined || value === null || value === '') return 'none';
  return String(value).replace(/\s+/g, ' ').trim() || 'none';
}

function safeKey(value) {
  const key = String(value || '').trim();
  if (!/^[a-zA-Z0-9_.-]+$/.test(key)) throw new Error(`invalid status cache key: ${value}`);
  return key;
}

function runsCacheDir(rootDir) {
  return path.resolve(rootDir, 'runs', 'cache');
}

export function statusCachePath(rootDir, key) {
  return path.join(runsCacheDir(rootDir), `${safeKey(key)}.json`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { __parseError: error instanceof Error ? error.message : String(error) };
  }
}

export function readStatusCache(rootDir, key, options = {}) {
  const filePath = statusCachePath(rootDir, key);
  const nowMs = options.nowMs ?? Date.now();
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? options['stale-after-seconds'] ?? 900);
  if (!fs.existsSync(filePath)) {
    return {
      key: safeKey(key),
      path: filePath,
      exists: false,
      parseOk: false,
      stale: true,
      ageSeconds: null,
      value: null,
      error: ''
    };
  }
  const parsed = readJson(filePath);
  const parseOk = !parsed.__parseError;
  const stat = fs.statSync(filePath);
  const generatedAt = parseOk ? parsed.generatedAt || parsed.cachedAt || stat.mtime.toISOString() : stat.mtime.toISOString();
  const generatedMs = Date.parse(generatedAt);
  const ageSeconds = Number.isFinite(generatedMs) ? Math.max(0, Math.floor((nowMs - generatedMs) / 1000)) : null;
  return {
    key: safeKey(key),
    path: filePath,
    exists: true,
    parseOk,
    stale: !parseOk || ageSeconds === null || ageSeconds > staleAfterSeconds,
    ageSeconds,
    staleAfterSeconds,
    value: parseOk ? parsed.value ?? parsed : null,
    error: parseOk ? '' : parsed.__parseError
  };
}

export function writeStatusCache(rootDir, key, value, options = {}) {
  const filePath = statusCachePath(rootDir, key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    schemaVersion: 1,
    key: safeKey(key),
    generatedAt: options.generatedAt || new Date().toISOString(),
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    value
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function buildStatusCache(rootDir, key, builders = {}, options = {}) {
  const cache = readStatusCache(rootDir, key, options);
  const builder = builders[safeKey(key)];
  const shouldWrite = Boolean(options.write || options.run || options.refresh);
  if (!shouldWrite) {
    return {
      schemaVersion: 1,
      generatedAt: options.generatedAt || new Date().toISOString(),
      key: safeKey(key),
      safeMode: true,
      destructiveActionsIncluded: false,
      secretValuesRead: false,
      cacheHit: cache.exists && cache.parseOk && !cache.stale,
      refreshed: false,
      cache,
      value: cache.value,
      refreshCommand: {
        args: ['node', 'src/cli.mjs', 'status-cache', '--key', safeKey(key), '--write', '--format', 'compact'],
        shell: `'node' 'src/cli.mjs' 'status-cache' '--key' '${safeKey(key)}' '--write' '--format' 'compact'`
      }
    };
  }
  if (!builder) throw new Error(`no status cache builder registered for key: ${key}`);
  const value = await builder();
  const pathWritten = writeStatusCache(rootDir, key, value, options);
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    key: safeKey(key),
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    cacheHit: false,
    refreshed: true,
    cache: readStatusCache(rootDir, key, options),
    value,
    path: pathWritten
  };
}

export function formatStatusCacheCompact(result) {
  const lines = [
    `key: ${compactValue(result.key)}`,
    `safe_mode: ${yesNo(result.safeMode)}`,
    `destructive_actions: ${yesNo(result.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(result.secretValuesRead)}`,
    `cache_exists: ${yesNo(result.cache?.exists)}`,
    `cache_hit: ${yesNo(result.cacheHit)}`,
    `cache_stale: ${yesNo(result.cache?.stale)}`,
    `cache_parse_ok: ${yesNo(result.cache?.parseOk)}`,
    `cache_age_seconds: ${result.cache?.ageSeconds ?? 'unknown'}`,
    `refreshed: ${yesNo(result.refreshed)}`,
    `path: ${compactValue(result.path || result.cache?.path)}`
  ];
  if (result.refreshCommand?.shell) lines.push(`refresh_command: ${result.refreshCommand.shell}`);
  if (result.cache?.error) lines.push(`cache_error: ${compactValue(result.cache.error)}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}
