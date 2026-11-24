// Helpers shared by the CLI command parts (split out of the former src/cli.mjs).
import fs from 'node:fs';
import { assertAllowedUrl, profilePath } from './policy.mjs';

// Returned by a command part when the requested command is not one of its own.
export const NOT_HANDLED = Symbol('sba.cli.not-handled');

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith('--')) {
      positional.push(item);
      continue;
    }
    const [rawKey, inlineValue] = item.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      flags[rawKey] = inlineValue;
    } else if (rest[index + 1] && !rest[index + 1].startsWith('--')) {
      flags[rawKey] = rest[index + 1];
      index += 1;
    } else {
      flags[rawKey] = true;
    }
  }
  return { command, flags, positional };
}

export function ensureDirs(policy, profileName) {
  fs.mkdirSync(policy.outputDir, { recursive: true });
  fs.mkdirSync(profilePath(policy, profileName), { recursive: true });
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function isDataUrl(url) {
  return typeof url === 'string' && url.startsWith('data:');
}

export function searchUrl(provider, query) {
  const encoded = encodeURIComponent(query);
  if (provider === 'brave') return `https://search.brave.com/search?q=${encoded}`;
  if (provider === 'google') return `https://www.google.com/search?igu=1&q=${encoded}`;
  return `https://html.duckduckgo.com/html/?q=${encoded}`;
}

export function searchStatus(provider, query, outline) {
  const haystack = `${outline.title || ''} ${outline.url || ''} ${JSON.stringify(outline.forms || [])}`.toLowerCase();
  const challenge = haystack.includes('captcha') || haystack.includes('sorry/index') || haystack.includes('anomaly.js') || haystack.includes('challenge');
  return {
    provider,
    query,
    challenge,
    resultLinks: (outline.links || []).filter((link) => link.text && link.href && !link.href.includes('/settings') && !link.href.includes('/html/')).length
  };
}

export function readJsonFile(filePath) {
  if (!filePath) throw new Error('JSON file path is required');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function readTextFlag(flags, textKey, fileKey) {
  if (typeof flags[textKey] === 'string') return flags[textKey];
  if (typeof flags[fileKey] === 'string') return fs.readFileSync(flags[fileKey], 'utf8');
  return '';
}

export function readFirstTextFlag(flags, pairs) {
  for (const [textKey, fileKey] of pairs) {
    const value = readTextFlag(flags, textKey, fileKey);
    if (value) return value;
  }
  return '';
}

export function expandRecipeSearchSteps(recipe) {
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
  for (const url of recipe.urls || []) {
    assertAllowedUrl(url, policy);
  }
  for (const step of recipe.steps || []) {
    if (step.url) assertAllowedUrl(step.url, policy);
  }
}
