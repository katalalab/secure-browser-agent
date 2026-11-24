// Helpers and the read-only result cache shared by the MCP tool parts (split out of the former src/mcp-server.mjs).
import fs from 'node:fs';
import { assertAllowedUrl, profilePath } from './policy.mjs';
import { buildRuntimeAudit, buildRuntimeCleanupPlan } from './runtime-audit.mjs';
import { buildObjectiveStatus } from './objective-status.mjs';
import { buildControlStatus } from './control-status.mjs';
import { buildChromeControlPlan } from './chrome-control-plan.mjs';
import { buildChromeMcpStatus } from './chrome-mcp-status.mjs';
import { buildChromeAppleEventsStatus } from './chrome-apple-events-status.mjs';
import { buildChromeExtensionStatus } from './chrome-extension-status.mjs';
import { buildProofGateStatus } from './proof-gate-status.mjs';
import { buildLoginHandoffStatus } from './login-handoff-status.mjs';

// Returned by a tool-call part when the requested tool is not one of its own.
export const NOT_HANDLED = Symbol('sba.mcp.not-handled');

export function ensureDirs(policy, profileName) {
  fs.mkdirSync(policy.outputDir, { recursive: true });
  fs.mkdirSync(profilePath(policy, profileName), { recursive: true });
}

export function csv(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

export function textResult(value, isError = false, text = '') {
  return {
    content: [{ type: 'text', text: text || JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError
  };
}

const MCP_CACHE_DEFAULT_TTL_MS = 15000;

const mcpCache = new Map();

function mcpCacheTtlMs() {
  const raw = process.env.SBA_MCP_CACHE_TTL_MS;
  if (raw === '0') return 0;
  const ttl = Number(raw ?? MCP_CACHE_DEFAULT_TTL_MS);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : MCP_CACHE_DEFAULT_TTL_MS;
}

export function canUseReadOnlyMcpCache(args = {}) {
  return !args.write && !args.out && !args.output && !args.run;
}

function mcpCacheKey(name, parts = {}) {
  return JSON.stringify([name, parts]);
}

async function cachedMcpValue(name, parts, builder) {
  const ttlMs = mcpCacheTtlMs();
  if (!ttlMs) return builder();
  const key = mcpCacheKey(name, parts);
  const now = Date.now();
  const existing = mcpCache.get(key);
  if (existing && existing.expiresAt > now) return existing.value;
  const value = Promise.resolve().then(builder);
  mcpCache.set(key, { expiresAt: now + ttlMs, value });
  try {
    return await value;
  } catch (error) {
    if (mcpCache.get(key)?.value === value) mcpCache.delete(key);
    throw error;
  }
}

export async function cachedRuntimeAudit(rootDir) {
  return cachedMcpValue('runtime-audit', { rootDir }, () => buildRuntimeAudit({ rootDir }));
}

export async function cachedRuntimeCleanupPlan(rootDir, ownerLimit) {
  const normalizedOwnerLimit = ownerLimit || 8;
  return cachedMcpValue('runtime-cleanup-plan', { rootDir, ownerLimit: normalizedOwnerLimit }, async () => buildRuntimeCleanupPlan({
    audit: await cachedRuntimeAudit(rootDir),
    ownerLimit: normalizedOwnerLimit
  }));
}

export async function cachedObjectiveStatus(rootDir) {
  return cachedMcpValue('objective-status', { rootDir }, () => buildObjectiveStatus({ rootDir }));
}

export async function cachedProofGateStatus(rootDir) {
  return cachedMcpValue('proof-gate-status', { rootDir }, () => buildProofGateStatus({ rootDir }));
}

export async function cachedLoginHandoffStatus(rootDir) {
  return cachedMcpValue('login-handoff-status', { rootDir }, async () => buildLoginHandoffStatus({
    rootDir,
    proofGateStatus: await cachedProofGateStatus(rootDir)
  }));
}

export async function cachedChromeExtensionStatus(rootDir, pluginDir = '') {
  return cachedMcpValue('chrome-extension-status', { rootDir, pluginDir }, () => buildChromeExtensionStatus({ pluginDir }));
}

export async function cachedChromeControlPlan(rootDir, lane = 'auto', pluginDir = '', options = {}) {
  return cachedMcpValue('chrome-control-plan', { rootDir, lane, pluginDir, ...options }, async () => buildChromeControlPlan({
    rootDir,
    lane,
    ...options,
    runtimeAudit: await cachedRuntimeAudit(rootDir),
    chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir, pluginDir)
  }));
}

function chromeMcpStatusParts(args = {}) {
  return {
    observedConnected: args.observedConnected ?? args.chromeMcpConnected,
    observedTools: args.observedTools ?? args.chromeMcpTools,
    observedPageListOk: args.observedPageListOk ?? args.chromeMcpPageListOk,
    observedPageCount: args.observedPageCount ?? args.chromeMcpPageCount,
    observedLastError: args.observedLastError ?? args.chromeMcpLastError ?? '',
    observedSource: args.observedSource ?? args.chromeMcpSource ?? ''
  };
}

export async function cachedChromeMcpStatus(rootDir, args = {}) {
  const parts = chromeMcpStatusParts(args);
  return cachedMcpValue('chrome-mcp-status', { rootDir, ...parts }, async () => buildChromeMcpStatus({
    rootDir,
    ...parts,
    runtimeAudit: await cachedRuntimeAudit(rootDir),
    chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir)
  }));
}

export async function cachedChromeAppleEventsStatus(rootDir) {
  return cachedMcpValue('chrome-apple-events-status', { rootDir }, () => buildChromeAppleEventsStatus());
}

export async function cachedControlStatus(rootDir, options = {}) {
  return cachedMcpValue('control-status', { rootDir }, async () => buildControlStatus({
    rootDir,
    monitorTimeoutMs: options.monitorTimeoutMs,
    monitorIntervalMs: options.monitorIntervalMs,
    objectiveStatus: await cachedObjectiveStatus(rootDir),
    runtimeAudit: await cachedRuntimeAudit(rootDir),
    chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir)
  }));
}

export function expandRecipeSearchSteps(recipe) {
  const searchUrl = (provider, query) => {
    const encoded = encodeURIComponent(query);
    if (provider === 'brave') return `https://search.brave.com/search?q=${encoded}`;
    if (provider === 'google') return `https://www.google.com/search?igu=1&q=${encoded}`;
    return `https://html.duckduckgo.com/html/?q=${encoded}`;
  };
  const copy = JSON.parse(JSON.stringify(recipe));
  copy.steps = (copy.steps || []).flatMap((step, index) => {
    if ((step.type || step.action) !== 'search') return [step];
    if (!step.query) throw new Error(`recipe step ${index + 1} search requires query`);
    const as = step.as || `search${index + 1}`;
    const provider = step.provider || copy.provider || 'duckduckgo';
    return [
      { type: 'goto', url: searchUrl(provider, step.query), as: `${as}_goto` },
      { type: 'outline', as, linkLimit: step.linkLimit || 50 },
      { type: 'search-status', provider, query: step.query, from: as, as: `${as}_status`, linkLimit: step.linkLimit || 50 }
    ];
  });
  return copy;
}

export function assertRecipeAllowed(recipe, policy) {
  if (recipe.url) assertAllowedUrl(recipe.url, policy);
  for (const url of recipe.urls || []) assertAllowedUrl(url, policy);
  for (const step of recipe.steps || []) {
    if (step.url) assertAllowedUrl(step.url, policy);
  }
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
