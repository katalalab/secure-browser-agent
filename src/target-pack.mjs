import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { safeOutputPath } from './output.mjs';
import { toPosixPath } from './output.mjs';

const SEARCH_PROVIDER_ORIGINS = {
  duckduckgo: 'https://html.duckduckgo.com',
  brave: 'https://search.brave.com',
  google: 'https://www.google.com'
};

const CHROME_PERMISSION_TYPES = {
  'automatic-downloads': 'automatic_downloads',
  camera: 'media_stream_camera',
  clipboard: 'clipboard',
  downloads: 'automatic_downloads',
  geolocation: 'geolocation',
  microphone: 'media_stream_mic',
  mic: 'media_stream_mic',
  notifications: 'notifications',
  popups: 'popups',
  sensors: 'sensors'
};

export function safeTargetName(name) {
  const safe = String(name || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!safe) throw new Error('target name is required');
  return safe;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseOrigins(originText) {
  const origins = String(originText || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) throw new Error('scaffold-target requires --origin');
  return origins.map((origin) => {
    if (origin === 'data:') return origin;
    const url = new URL(origin);
    return url.origin;
  });
}

function originForUrl(rawUrl) {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('data:')) return 'data:';
  return new URL(rawUrl).origin;
}

function urlAllowed(rawUrl, allowedOrigins) {
  if (!rawUrl) return true;
  const origin = originForUrl(rawUrl);
  if (allowedOrigins.includes(origin)) return true;
  return allowedOrigins.some((entry) => entry.startsWith('*.') && originForUrl(rawUrl).endsWith(entry.slice(1)));
}

function normalizeTargetUrl(rawUrl) {
  if (!rawUrl) throw new Error('url is required');
  if (rawUrl.startsWith('data:')) return rawUrl;
  return new URL(rawUrl).toString();
}

function sameOriginUrl(origin, suffix) {
  if (!origin || origin === 'data:') return '';
  return new URL(suffix, origin).toString();
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(file, fallback = {}) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseCsv(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function chromeContentSettingPattern(origin) {
  const url = new URL(origin);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  return `${url.protocol}//${url.hostname}:${port},*`;
}

function normalizeChromePermissions(values = []) {
  const permissions = unique(values.map((item) => String(item).trim().toLowerCase()).filter(Boolean));
  const unsupported = permissions.filter((item) => !CHROME_PERMISSION_TYPES[item]);
  if (unsupported.length > 0) {
    throw new Error(`unsupported target permission: ${unsupported.join(', ')}`);
  }
  return permissions;
}

function normalizePermissionOrigins(pack, options = {}) {
  const source = parseCsv(options.origin || options.origins);
  const origins = source.length > 0
    ? source
    : (pack.metadata.permissions?.origins || pack.metadata.origins || []).filter((origin) => origin && origin !== 'data:');
  const normalized = unique(origins.map((origin) => new URL(origin).origin));
  const allowedOrigins = pack.targetPolicy.allowedOrigins || [];
  const blocked = normalized.filter((origin) => !urlAllowed(origin, allowedOrigins));
  if (blocked.length > 0) {
    throw new Error(`blocked permission origin by target policy: ${blocked.join(', ')}`);
  }
  return normalized;
}

function plistEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function plistArray(values) {
  return values.map((value) => `    <string>${plistEscape(value)}</string>`).join('\n');
}

function buildLaunchAgentPlist({ label, programArguments, startInterval, stdoutPath, stderrPath }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plistEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
${plistArray(programArguments)}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>${startInterval}</integer>
  <key>StandardOutPath</key>
  <string>${plistEscape(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${plistEscape(stderrPath)}</string>
</dict>
</plist>
`;
}

function currentUid() {
  if (typeof process.getuid === 'function') return process.getuid();
  return Number(process.env.UID || 0);
}

function launchctlDomain(uid = currentUid()) {
  return `gui/${uid}`;
}

function launchctlServiceTarget(label, uid = currentUid()) {
  return `${launchctlDomain(uid)}/${label}`;
}

function runLaunchctl(args, runner = spawnSync) {
  const result = runner('launchctl', args, {
    encoding: 'utf8',
    timeout: 10000
  });
  return {
    args: ['launchctl', ...args],
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    error: result.error ? result.error.message : ''
  };
}

export function scaffoldTargetPack(policy, options = {}) {
  const name = safeTargetName(options.name);
  const targetDir = safeOutputPath(policy, options.dir || `target-packs/${name}`);
  if (fs.existsSync(targetDir) && !options.force) {
    throw new Error(`target pack already exists: ${targetDir} (use --force to overwrite)`);
  }

  const origins = parseOrigins(options.origins);
  const primaryOrigin = origins.find((origin) => origin !== 'data:') || origins[0];
  const loginUrl = options.loginUrl || sameOriginUrl(primaryOrigin, '/login');
  const pageUrl = options.pageUrl || primaryOrigin;
  const query = options.query || `${name} docs`;
  const searchProvider = options.searchProvider || 'duckduckgo';
  const permissions = normalizeChromePermissions(parseCsv(options.permissions));
  const searchOrigin = SEARCH_PROVIDER_ORIGINS[searchProvider];
  if (!searchOrigin) throw new Error(`unsupported search provider: ${searchProvider}`);

  fs.mkdirSync(path.join(targetDir, 'recipes'), { recursive: true });

  const policyFile = path.join(targetDir, 'policy.json');
  const metadataFile = path.join(targetDir, 'target.json');
  const relativeBase = path.basename(targetDir);
  const targetPolicy = {
    allowedOrigins: unique([...origins, searchOrigin]),
    defaultProfile: name,
    defaultEngine: 'chrome',
    allowedEngines: ['chrome'],
    authenticatedEngines: ['chrome'],
    outputDir: `${relativeBase}/outputs`,
    profileDir: `${relativeBase}/profiles`,
    redactKeys: policy.redactKeys || [
      'authorization',
      'cookie',
      'set-cookie',
      'token',
      'password',
      'secret',
      'api_key',
      'apiKey'
    ],
    maxEvalBytes: policy.maxEvalBytes || 12000
  };
  writeJson(policyFile, targetPolicy);
  writeJson(metadataFile, {
    schemaVersion: 1,
    target: name,
    origins,
    loginUrl,
    pageUrl,
    query,
    searchProvider,
    profile: name,
    permissions: {
      origins: origins.filter((origin) => origin !== 'data:'),
      allow: permissions
    }
  });

  const outlineRecipe = {
    url: pageUrl,
    steps: [
      { type: 'outline', as: 'page', linkLimit: 100 }
    ]
  };
  const observeRecipe = {
    url: pageUrl,
    steps: [
      { type: 'observe', as: 'page', linkLimit: 25, controlLimit: 40, textLimit: 600 }
    ]
  };
  const inspectRecipe = {
    url: pageUrl,
    steps: [
      { type: 'inspect', as: 'inspect', candidateLimit: 20, sampleLimit: 3 }
    ]
  };
  const operateRecipe = {
    url: pageUrl,
    steps: [
      { type: 'observe', as: 'before', linkLimit: 25, controlLimit: 40, textLimit: 600 },
      { type: 'inspect', as: 'candidates', candidateLimit: 20, sampleLimit: 3 }
    ]
  };
  const diagnoseRecipe = {
    url: pageUrl,
    steps: [
      { type: 'observe', as: 'page', linkLimit: 25, controlLimit: 40, textLimit: 600 },
      { type: 'console', as: 'console', waitMs: 300 },
      { type: 'screenshot', out: 'diagnose.png', as: 'screenshot' }
    ]
  };
  const screenshotRecipe = {
    url: pageUrl,
    steps: [
      { type: 'screenshot', out: 'page.png', as: 'page_screenshot' }
    ]
  };
  const crawlRecipe = {
    urls: [
      pageUrl
    ],
    steps: [
      { type: 'observe', as: 'page', linkLimit: 25, controlLimit: 40, textLimit: 600 },
      { type: 'extract', selector: 'a[href]', fields: ['text', 'href'], limit: 50, as: 'links' }
    ]
  };
  const scrapeLinksRecipe = {
    url: pageUrl,
    steps: [
      { type: 'extract', selector: 'a[href]', fields: ['text', 'href'], limit: 200, as: 'links' }
    ]
  };
  const searchRecipe = {
    provider: searchProvider,
    steps: [
      { type: 'search', query, as: 'search', linkLimit: 50 }
    ]
  };

  writeJson(path.join(targetDir, 'recipes', 'diagnose.json'), diagnoseRecipe);
  writeJson(path.join(targetDir, 'recipes', 'observe.json'), observeRecipe);
  writeJson(path.join(targetDir, 'recipes', 'inspect.json'), inspectRecipe);
  writeJson(path.join(targetDir, 'recipes', 'analyze.json'), inspectRecipe);
  writeJson(path.join(targetDir, 'recipes', 'operate.json'), operateRecipe);
  writeJson(path.join(targetDir, 'recipes', 'screenshot.json'), screenshotRecipe);
  writeJson(path.join(targetDir, 'recipes', 'crawl.json'), crawlRecipe);
  writeJson(path.join(targetDir, 'recipes', 'outline.json'), outlineRecipe);
  writeJson(path.join(targetDir, 'recipes', 'scrape-links.json'), scrapeLinksRecipe);
  writeJson(path.join(targetDir, 'recipes', 'search.json'), searchRecipe);

  const readme = `# ${name} browser agent pack

This pack keeps browser profiles, outputs, and manifests under this target directory.

## Login

\`\`\`bash
node src/cli.mjs login-cdp ${loginUrl} --policy ${policyFile} --profile ${name}
node src/cli.mjs target-login ${targetDir}
node src/cli.mjs target-status ${targetDir}
node src/cli.mjs target-permissions ${targetDir} status
node src/cli.mjs target-permissions ${targetDir} apply
node src/cli.mjs target-daemon ${targetDir} start
node src/cli.mjs target-autostart ${targetDir} write
\`\`\`

Finish login in the opened dedicated Chrome profile, then close that browser before headless runs.

## Inspect

\`\`\`bash
node src/cli.mjs target-add-url ${targetDir} ${pageUrl}
node src/cli.mjs target-run ${targetDir} diagnose --daemon
node src/cli.mjs target-run ${targetDir} observe --daemon
node src/cli.mjs target-run ${targetDir} inspect --daemon
node src/cli.mjs target-run ${targetDir} analyze --daemon
node src/cli.mjs target-run ${targetDir} operate --daemon
node src/cli.mjs target-run ${targetDir} outline --daemon
node src/cli.mjs target-run ${targetDir} screenshot --daemon
node src/cli.mjs target-run ${targetDir} crawl --daemon
node src/cli.mjs target-run ${targetDir} crawl-links --daemon
node src/cli.mjs target-scrape ${targetDir} --daemon
node src/cli.mjs target-daemon ${targetDir} stop
\`\`\`

## Scrape Links

\`\`\`bash
node src/cli.mjs target-run ${targetDir} links
\`\`\`

## Search

\`\`\`bash
node src/cli.mjs target-run ${targetDir} search
\`\`\`

## Real External Proof

\`\`\`bash
node src/cli.mjs target-proof-plan ${targetDir} --real-external --format markdown
node src/cli.mjs target-login-capture ${targetDir} --real-external --wait-auth-status-out wait-auth-status.json --format markdown
node src/cli.mjs target-proof-capture ${targetDir} --real-external --format markdown
node src/cli.mjs target-proof-capture ${targetDir} --real-external --run --wait-auth --wait-auth-status-out wait-auth-status.json --format markdown
node src/cli.mjs target-benchmark ${targetDir} --write --out proof/target-benchmark.json --format json
node src/cli.mjs target-proof ${targetDir} --real-external --write --benchmark-file ${path.join(targetDir, 'proof', 'target-benchmark.json')}
node src/cli.mjs readiness-audit --format markdown
\`\`\`
`;
  fs.writeFileSync(path.join(targetDir, 'README.md'), readme, 'utf8');

  return {
    target: name,
    dir: targetDir,
    policy: policyFile,
    metadata: metadataFile,
    recipes: {
      diagnose: path.join(targetDir, 'recipes', 'diagnose.json'),
      observe: path.join(targetDir, 'recipes', 'observe.json'),
      inspect: path.join(targetDir, 'recipes', 'inspect.json'),
      analyze: path.join(targetDir, 'recipes', 'analyze.json'),
      operate: path.join(targetDir, 'recipes', 'operate.json'),
      screenshot: path.join(targetDir, 'recipes', 'screenshot.json'),
      crawl: path.join(targetDir, 'recipes', 'crawl.json'),
      outline: path.join(targetDir, 'recipes', 'outline.json'),
      links: path.join(targetDir, 'recipes', 'scrape-links.json'),
      search: path.join(targetDir, 'recipes', 'search.json')
    },
    loginUrl,
    pageUrl
  };
}

export function resolveTargetPack(targetDir) {
  if (!targetDir) throw new Error('target pack directory is required');
  const dir = path.resolve(targetDir);
  const policy = path.join(dir, 'policy.json');
  if (!fs.existsSync(policy)) throw new Error(`target policy not found: ${toPosixPath(policy)}`);
  const targetPolicy = JSON.parse(fs.readFileSync(policy, 'utf8'));
  const metadataFile = path.join(dir, 'target.json');
  const metadata = fs.existsSync(metadataFile)
    ? JSON.parse(fs.readFileSync(metadataFile, 'utf8'))
    : {
        target: targetPolicy.defaultProfile || path.basename(dir),
        origins: targetPolicy.allowedOrigins || [],
        loginUrl: sameOriginUrl((targetPolicy.allowedOrigins || []).find((origin) => origin !== 'data:'), '/login'),
        profile: targetPolicy.defaultProfile || path.basename(dir)
      };
  return { dir, policy, targetPolicy, metadata, metadataFile };
}

export function resolveTargetRun(targetDir, recipeName = 'outline', options = {}) {
  if (!targetDir) throw new Error('target-run requires a target pack directory');
  const pack = resolveTargetPack(targetDir);

  const recipeMap = {
    diagnose: { file: 'diagnose.json', out: 'diagnose.json', format: 'json', result: '' },
    observe: { file: 'observe.json', out: 'observe.json', format: 'json', result: '' },
    inspect: { file: 'inspect.json', out: 'inspect.json', format: 'json', result: '' },
    analyze: { file: 'analyze.json', out: 'analyze.json', format: 'json', result: '' },
    operate: { file: 'operate.json', out: 'operate.json', format: 'json', result: '' },
    screenshot: { file: 'screenshot.json', out: 'screenshot.json', format: 'json', result: '' },
    crawl: { file: 'crawl.json', out: 'crawl.json', format: 'json', result: '' },
    'crawl-links': { file: 'crawl.json', out: 'crawl-links.csv', format: 'csv', result: 'pages[].results.links' },
    outline: { file: 'outline.json', out: 'outline.json', format: 'json', result: '' },
    links: { file: 'scrape-links.json', out: 'links.csv', format: 'csv', result: 'links' },
    search: { file: 'search.json', out: 'search.json', format: 'json', result: '' }
  };
  const defaults = recipeMap[recipeName] || { file: `${recipeName}.json`, out: `${recipeName}.json`, format: 'json', result: '' };
  const recipe = path.join(pack.dir, 'recipes', defaults.file);
  if (!fs.existsSync(recipe)) throw new Error(`target recipe not found: ${recipe}`);

  return {
    dir: pack.dir,
    policy: pack.policy,
    recipe,
    recipeName,
    profile: options.profile || pack.targetPolicy.defaultProfile || path.basename(pack.dir),
    out: options.out || defaults.out,
    format: options.format || defaults.format,
    result: options.result || defaults.result
  };
}

function fileInfo(file) {
  if (!fs.existsSync(file)) {
    return {
      exists: false,
      bytes: 0,
      modifiedAt: '',
      ageSeconds: null
    };
  }
  const stat = fs.statSync(file);
  return {
    exists: true,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    ageSeconds: Math.max(0, Math.floor((Date.now() - stat.mtime.getTime()) / 1000))
  };
}

function valueKind(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function summarizeResultValue(value) {
  const kind = valueKind(value);
  if (Array.isArray(value)) {
    return {
      kind,
      count: value.length,
      objectKeys: value[0] && typeof value[0] === 'object' && !Array.isArray(value[0]) ? Object.keys(value[0]).sort() : []
    };
  }
  if (value && typeof value === 'object') {
    return {
      kind,
      ok: typeof value.ok === 'boolean' ? value.ok : null,
      count: typeof value.count === 'number' ? value.count : null,
      keys: Object.keys(value).sort(),
      nestedArrays: Object.fromEntries(Object.entries(value)
        .filter(([, item]) => Array.isArray(item))
        .map(([key, item]) => [key, item.length]))
    };
  }
  return { kind };
}

function summarizeJsonOutput(value) {
  const steps = Array.isArray(value?.steps) ? value.steps : [];
  const results = value?.results && typeof value.results === 'object' ? value.results : {};
  return {
    ok: typeof value?.ok === 'boolean' ? value.ok : null,
    urlPresent: Boolean(value?.url),
    pageCount: Array.isArray(value?.pages) ? value.pages.length : 0,
    stepCount: steps.length,
    stepTypes: steps.map((step) => step.type || '').filter(Boolean),
    stepNames: steps.map((step) => step.as || '').filter(Boolean),
    resultKeys: Object.keys(results),
    resultSummary: Object.fromEntries(Object.entries(results).map(([key, item]) => [key, summarizeResultValue(item)]))
  };
}

function summarizeCsvText(text) {
  const normalized = text.replace(/^\uFEFF/, '').trimEnd();
  if (!normalized) return { rowCount: 0, columnCount: 0 };
  const lines = normalized.split(/\r?\n/);
  const header = lines[0] || '';
  return {
    rowCount: Math.max(0, lines.length - 1),
    columnCount: header ? header.split(',').length : 0
  };
}

function loadTargetRunPolicy(policyFile) {
  const parsed = readJson(policyFile);
  const baseDir = path.dirname(policyFile);
  return {
    ...parsed,
    source: policyFile,
    baseDir,
    outputDir: path.resolve(baseDir, '..', parsed.outputDir || 'outputs'),
    profileDir: path.resolve(baseDir, '..', parsed.profileDir || 'profiles')
  };
}

export function buildTargetRunStatus(targetDir, recipeName = 'outline', options = {}) {
  const normalizedRecipe = recipeName || 'outline';
  const target = normalizedRecipe === 'scrape'
    ? resolveTargetScrape(targetDir, { ...options, format: options.outputFormat || options.targetFormat })
    : resolveTargetRun(targetDir, normalizedRecipe, {
        ...options,
        format: options.outputFormat || options.targetFormat
      });
  const targetPolicy = loadTargetRunPolicy(target.policy);
  const output = options.in || options.input || target.out;
  const outputPath = safeOutputPath(targetPolicy, output);
  const info = fileInfo(outputPath);
  const staleAfterSeconds = Number(options.staleAfterSeconds || options['stale-after-seconds'] || 900);
  const format = path.extname(outputPath).toLowerCase() === '.csv' ? 'csv' : 'json';
  const status = {
    target: targetPolicy.defaultProfile || path.basename(target.dir),
    targetDir: target.dir,
    recipeName: normalizedRecipe,
    output,
    outputPath,
    format,
    exists: info.exists,
    bytes: info.bytes,
    modifiedAt: info.modifiedAt,
    ageSeconds: info.ageSeconds,
    stale: info.exists && Number.isFinite(staleAfterSeconds) ? info.ageSeconds > staleAfterSeconds : false,
    parseOk: false,
    ok: null,
    urlPresent: false,
    pageCount: 0,
    stepCount: 0,
    stepTypes: [],
    stepNames: [],
    resultKeys: [],
    resultSummary: {},
    rowCount: null,
    columnCount: null,
    error: '',
    secretValuesRead: false,
    pageTextReturned: false,
    rowDataReturned: false,
    commands: {
      refresh: {
        args: normalizedRecipe === 'scrape'
          ? ['node', 'src/cli.mjs', 'target-scrape', target.dir, '--out', target.out, '--format', target.format]
          : ['node', 'src/cli.mjs', 'target-run', target.dir, target.recipeName, '--out', target.out, '--format', target.format],
        shell: (normalizedRecipe === 'scrape'
          ? ['node', 'src/cli.mjs', 'target-scrape', target.dir, '--out', target.out, '--format', target.format]
          : ['node', 'src/cli.mjs', 'target-run', target.dir, target.recipeName, '--out', target.out, '--format', target.format])
          .map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
      },
      status: {
        args: ['node', 'src/cli.mjs', 'target-run-status', target.dir, normalizedRecipe, '--format', 'compact'],
        shell: ['node', 'src/cli.mjs', 'target-run-status', target.dir, normalizedRecipe, '--format', 'compact'].map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
      }
    }
  };
  if (!info.exists) return status;
  try {
    const text = fs.readFileSync(outputPath, 'utf8');
    if (format === 'csv') {
      const csv = summarizeCsvText(text);
      Object.assign(status, {
        parseOk: true,
        rowCount: csv.rowCount,
        columnCount: csv.columnCount
      });
      return status;
    }
    const json = JSON.parse(text);
    Object.assign(status, {
      parseOk: true,
      ...summarizeJsonOutput(json)
    });
  } catch (error) {
    status.error = error.message;
  }
  return status;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compactValue(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

export function formatTargetRunStatusCompact(status) {
  return [
    `target: ${compactValue(status.target)}`,
    `recipe: ${compactValue(status.recipeName)}`,
    `output: ${compactValue(status.output)}`,
    `exists: ${yesNo(status.exists)}`,
    `format: ${compactValue(status.format)}`,
    `bytes: ${status.bytes ?? 0}`,
    `age_seconds: ${status.ageSeconds ?? 'unknown'}`,
    `stale: ${yesNo(status.stale)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `ok: ${status.ok === null ? 'unknown' : yesNo(status.ok)}`,
    `url_present: ${yesNo(status.urlPresent)}`,
    `page_count: ${status.pageCount ?? 0}`,
    `step_count: ${status.stepCount ?? 0}`,
    `step_types: ${status.stepTypes?.length ? status.stepTypes.join(',') : 'none'}`,
    `step_names: ${status.stepNames?.length ? status.stepNames.join(',') : 'none'}`,
    `result_keys: ${status.resultKeys?.length ? status.resultKeys.join(',') : 'none'}`,
    `row_count: ${status.rowCount ?? 'unknown'}`,
    `column_count: ${status.columnCount ?? 'unknown'}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `page_text_returned: ${yesNo(status.pageTextReturned)}`,
    `row_data_returned: ${yesNo(status.rowDataReturned)}`,
    `error: ${compactValue(status.error)}`,
    `refresh_command: ${status.commands?.refresh?.shell || 'none'}`,
    `status_command: ${status.commands?.status?.shell || 'none'}`
  ].join('\n') + '\n';
}

export function resolveTargetLogin(targetDir, options = {}) {
  if (!targetDir) throw new Error('target-login requires a target pack directory');
  const pack = resolveTargetPack(targetDir);
  if (!pack.metadata.loginUrl) throw new Error(`target loginUrl not found: ${pack.metadataFile}`);
  return {
    dir: pack.dir,
    policy: pack.policy,
    profile: options.profile || pack.metadata.profile || pack.targetPolicy.defaultProfile || path.basename(pack.dir),
    loginUrl: pack.metadata.loginUrl,
    target: pack.metadata.target || path.basename(pack.dir)
  };
}

export function targetLoginHandoff(targetDir, options = {}) {
  const realExternal = Boolean(options.realExternal || options['real-external']);
  const args = ['node', 'src/cli.mjs', 'target-proof-capture', targetDir];
  if (realExternal) args.push('--real-external');
  args.push('--run', '--wait-auth', '--wait-auth-status-out', 'wait-auth-status.json', '--format', 'markdown');
  return {
    instructions: [
      'Complete login in the opened dedicated Chrome profile.',
      'You may run the capture command while login is still in progress; it waits for the auth-check to pass.',
      'Close the headed login browser after the account page is usable and the capture has started or completed.'
    ],
    commands: [
      {
        id: 'post-login-capture',
        title: 'Capture the authenticated target proof after login',
        args,
        shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
      },
      {
        id: 'status',
        title: 'Inspect proof readiness without writing more state',
        args: ['node', 'src/cli.mjs', 'target-proof-plan', targetDir, ...(realExternal ? ['--real-external'] : []), '--format', 'markdown'],
        shell: ['node', 'src/cli.mjs', 'target-proof-plan', targetDir, ...(realExternal ? ['--real-external'] : []), '--format', 'markdown']
          .map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
      }
    ]
  };
}

export function resolveTargetScrape(targetDir, options = {}) {
  if (!targetDir) throw new Error('target-scrape requires a target pack directory');
  const pack = resolveTargetPack(targetDir);
  const url = options.url || pack.metadata.pageUrl;
  if (!url) throw new Error(`target pageUrl not found: ${pack.metadataFile}`);
  return {
    dir: pack.dir,
    policy: pack.policy,
    profile: options.profile || pack.metadata.profile || pack.targetPolicy.defaultProfile || path.basename(pack.dir),
    url,
    out: options.out || 'scrape.csv',
    format: options.format || 'csv',
    result: options.result || 'rows',
    target: pack.metadata.target || path.basename(pack.dir)
  };
}

export function resolveTargetDaemon(targetDir, action = 'status', options = {}) {
  if (!targetDir) throw new Error('target-daemon requires a target pack directory');
  const pack = resolveTargetPack(targetDir);
  const normalizedAction = action || 'status';
  if (!['start', 'status', 'stop'].includes(normalizedAction)) {
    throw new Error(`unsupported target-daemon action: ${normalizedAction}`);
  }
  return {
    dir: pack.dir,
    policy: pack.policy,
    profile: options.profile || pack.metadata.profile || pack.targetPolicy.defaultProfile || path.basename(pack.dir),
    action: normalizedAction,
    initialUrl: options.url || pack.metadata.pageUrl || 'about:blank',
    target: pack.metadata.target || path.basename(pack.dir)
  };
}

export function resolveTargetAutostart(targetDir, action = 'plan', options = {}) {
  if (!targetDir) throw new Error('target-autostart requires a target pack directory');
  const pack = resolveTargetPack(targetDir);
  const normalizedAction = action || 'plan';
  if (!['plan', 'write', 'install', 'load', 'unload', 'status', 'remove'].includes(normalizedAction)) {
    throw new Error(`unsupported target-autostart action: ${normalizedAction}`);
  }
  const target = pack.metadata.target || path.basename(pack.dir);
  const profile = options.profile || pack.metadata.profile || pack.targetPolicy.defaultProfile || path.basename(pack.dir);
  const label = options.label || `local.secure-browser-agent.${safeTargetName(target)}`;
  const interval = Number(options.interval || 300);
  if (!Number.isInteger(interval) || interval < 30) {
    throw new Error('target-autostart --interval must be an integer >= 30 seconds');
  }
  const initialUrl = options.url || pack.metadata.pageUrl || 'about:blank';
  const localDir = path.join(pack.dir, 'launchd');
  const installPath = options.installPath
    ? path.resolve(options.installPath)
    : path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  const plistPath = options.plist
    ? path.resolve(options.plist)
    : normalizedAction === 'install'
      ? installPath
      : path.join(localDir, `${label}.plist`);
  const stdoutPath = path.join(localDir, `${label}.out.log`);
  const stderrPath = path.join(localDir, `${label}.err.log`);
  const uid = Number(options.uid || currentUid());
  const domain = launchctlDomain(uid);
  const serviceTarget = launchctlServiceTarget(label, uid);
  const programArguments = [
    options.nodePath || process.execPath,
    options.cliPath || fileURLToPath(new URL('./cli.mjs', import.meta.url)),
    'target-daemon',
    pack.dir,
    'start',
    '--profile',
    profile
  ];
  if (initialUrl !== 'about:blank') {
    programArguments.push('--url', initialUrl);
  }
  if (options.headed) {
    programArguments.push('--headed');
  }
  const plist = buildLaunchAgentPlist({
    label,
    programArguments,
    startInterval: interval,
    stdoutPath,
    stderrPath
  });
  return {
    target,
    action: normalizedAction,
    dir: pack.dir,
    policy: pack.policy,
    profile,
    label,
    interval,
    initialUrl,
    plistPath,
    installPath,
    stdoutPath,
    stderrPath,
    uid,
    domain,
    serviceTarget,
    bootstrapCommand: ['launchctl', 'bootstrap', domain, installPath],
    bootoutCommand: ['launchctl', 'bootout', serviceTarget],
    printCommand: ['launchctl', 'print', serviceTarget],
    programArguments,
    plist
  };
}

export function resolveTargetPermissions(targetDir, action = 'status', options = {}) {
  if (!targetDir) throw new Error('target-permissions requires a target pack directory');
  const pack = resolveTargetPack(targetDir);
  const normalizedAction = action || 'status';
  if (!['status', 'plan', 'set', 'apply'].includes(normalizedAction)) {
    throw new Error(`unsupported target-permissions action: ${normalizedAction}`);
  }
  const metadataPermissions = pack.metadata.permissions || {};
  const allow = normalizeChromePermissions(parseCsv(options.allow || options.permission || options.permissions).length > 0
    ? parseCsv(options.allow || options.permission || options.permissions)
    : metadataPermissions.allow || []);
  const origins = normalizePermissionOrigins(pack, options);
  const profile = options.profile || pack.metadata.profile || pack.targetPolicy.defaultProfile || path.basename(pack.dir);
  const entries = origins.flatMap((origin) => allow.map((permission) => ({
    origin,
    pattern: chromeContentSettingPattern(origin),
    permission,
    chromeType: CHROME_PERMISSION_TYPES[permission],
    setting: 1
  })));
  return {
    target: pack.metadata.target || path.basename(pack.dir),
    action: normalizedAction,
    dir: pack.dir,
    policy: pack.policy,
    metadataFile: pack.metadataFile,
    profile,
    origins,
    allow,
    entries
  };
}

export function writeTargetPermissions(plan) {
  const metadata = readJson(plan.metadataFile);
  metadata.permissions = {
    origins: plan.origins,
    allow: plan.allow
  };
  writeJson(plan.metadataFile, metadata);
  return {
    ...plan,
    metadata: plan.metadataFile,
    changed: true
  };
}

function targetPreferencesPath(profileDir) {
  return path.join(profileDir, 'Default', 'Preferences');
}

function applyPermissionEntry(preferences, entry) {
  preferences.profile ||= {};
  preferences.profile.content_settings ||= {};
  preferences.profile.content_settings.exceptions ||= {};
  preferences.profile.content_settings.exceptions[entry.chromeType] ||= {};
  preferences.profile.content_settings.exceptions[entry.chromeType][entry.pattern] = { setting: entry.setting };
}

export function applyTargetPermissions(plan, profileDir) {
  if (!profileDir) throw new Error('profileDir is required');
  const preferencesPath = targetPreferencesPath(profileDir);
  fs.mkdirSync(path.dirname(preferencesPath), { recursive: true });
  const preferences = readJson(preferencesPath);
  for (const entry of plan.entries) applyPermissionEntry(preferences, entry);
  fs.writeFileSync(preferencesPath, `${JSON.stringify(preferences, null, 2)}\n`, 'utf8');
  return {
    ...plan,
    preferencesPath,
    applied: plan.entries.length,
    changed: true
  };
}

export function targetPermissionStatus(plan, profileDir) {
  const preferencesPath = targetPreferencesPath(profileDir);
  const preferences = readJson(preferencesPath);
  const exceptions = preferences.profile?.content_settings?.exceptions || {};
  const applied = plan.entries.filter((entry) => exceptions[entry.chromeType]?.[entry.pattern]?.setting === entry.setting);
  return {
    ...plan,
    preferencesPath,
    preferencesExists: fs.existsSync(preferencesPath),
    applied: applied.length,
    pending: plan.entries.length - applied.length
  };
}

export function writeTargetAutostart(plan) {
  fs.mkdirSync(path.dirname(plan.plistPath), { recursive: true });
  fs.mkdirSync(path.dirname(plan.stdoutPath), { recursive: true });
  fs.writeFileSync(plan.plistPath, plan.plist, 'utf8');
  return {
    ...plan,
    exists: true,
    installed: plan.plistPath === plan.installPath,
    next: plan.action === 'install'
      ? `launchctl bootstrap gui/$(id -u) ${plan.plistPath}`
      : `Review ${plan.plistPath}; copy to ${plan.installPath} or run target-autostart ${plan.dir} install when ready.`
  };
}

export function targetAutostartStatus(plan, options = {}) {
  const launchctl = runLaunchctl(['print', plan.serviceTarget], options.runner);
  return {
    ...plan,
    exists: fs.existsSync(plan.plistPath),
    installed: fs.existsSync(plan.installPath),
    loaded: launchctl.ok,
    launchctl
  };
}

export function loadTargetAutostart(plan, options = {}) {
  const installPlan = {
    ...plan,
    action: 'install',
    plistPath: plan.installPath
  };
  const written = writeTargetAutostart(installPlan);
  const launchctl = runLaunchctl(['bootstrap', plan.domain, plan.installPath], options.runner);
  return {
    ...written,
    action: plan.action,
    loaded: launchctl.ok,
    launchctl,
    next: launchctl.ok
      ? `Inspect with: launchctl print ${plan.serviceTarget}`
      : `If already loaded, inspect with: launchctl print ${plan.serviceTarget}; unload with: launchctl bootout ${plan.serviceTarget}`
  };
}

export function unloadTargetAutostart(plan, options = {}) {
  const launchctl = runLaunchctl(['bootout', plan.serviceTarget], options.runner);
  return {
    ...plan,
    exists: fs.existsSync(plan.plistPath),
    installed: fs.existsSync(plan.installPath),
    loaded: false,
    launchctl,
    next: launchctl.ok
      ? `Remove plist with: target-autostart ${plan.dir} remove`
      : `If the service was not loaded, remove plist with: target-autostart ${plan.dir} remove`
  };
}

export function removeTargetAutostart(plan) {
  const existed = fs.existsSync(plan.plistPath);
  if (existed) fs.rmSync(plan.plistPath, { force: true });
  return {
    ...plan,
    existed,
    exists: false,
    next: plan.plistPath === plan.installPath
      ? `If loaded, run: launchctl bootout ${plan.serviceTarget}`
      : ''
  };
}

export function addTargetUrls(targetDir, urls = [], options = {}) {
  if (!targetDir) throw new Error('target-add-url requires a target pack directory');
  if (!Array.isArray(urls) || urls.length === 0) throw new Error('target-add-url requires at least one URL');
  const pack = resolveTargetPack(targetDir);
  const recipeFile = path.join(pack.dir, 'recipes', options.recipe || 'crawl.json');
  if (!fs.existsSync(recipeFile)) throw new Error(`target crawl recipe not found: ${recipeFile}`);
  const recipe = JSON.parse(fs.readFileSync(recipeFile, 'utf8'));
  const allowedOrigins = pack.targetPolicy.allowedOrigins || [];
  const before = Array.isArray(recipe.urls) ? recipe.urls.map(normalizeTargetUrl) : [];
  const added = [];
  const blocked = [];
  const next = before.slice();

  for (const rawUrl of urls) {
    const url = normalizeTargetUrl(rawUrl);
    if (!urlAllowed(url, allowedOrigins)) {
      blocked.push(url);
      continue;
    }
    if (!next.includes(url)) {
      next.push(url);
      added.push(url);
    }
  }

  if (blocked.length > 0) {
    throw new Error(`blocked URL by target policy: ${blocked.join(', ')}`);
  }

  recipe.urls = next;
  if (!options.dryRun) writeJson(recipeFile, recipe);
  return {
    target: pack.metadata.target || path.basename(pack.dir),
    recipe: recipeFile,
    beforeCount: before.length,
    afterCount: next.length,
    added,
    unchanged: next.length - before.length === 0,
    dryRun: Boolean(options.dryRun)
  };
}

function safeStepName(value, fallback) {
  const name = String(value || '').trim();
  if (!name) return fallback;
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error(`invalid step name: ${name}`);
  return name;
}

function positiveNumber(value, fallback, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be a non-negative number`);
  return number;
}

function selectorLooksSensitive(selector = '', as = '') {
  return /password|passwd|token|secret|otp|mfa|2fa/i.test(`${selector} ${as}`);
}

function sanitizeOperateStep(step) {
  const sanitized = { ...step };
  if (Object.hasOwn(sanitized, 'value')) {
    sanitized.valueLength = String(sanitized.value || '').length;
    sanitized.value = '<inline-value-redacted>';
  }
  return sanitized;
}

function normalizeOperateStep(action, options = {}) {
  const type = String(action || options.action || '').trim().toLowerCase();
  if (!type) throw new Error('target-operate-add requires an action');
  const selector = options.selector || '';
  const as = safeStepName(options.as, type.replaceAll('-', '_'));
  const url = options.url ? normalizeTargetUrl(options.url) : '';
  const base = { type, as };
  if (url) base.url = url;

  if (type === 'fill') {
    if (!selector) throw new Error('target-operate-add fill requires --selector');
    const valueEnv = options.valueEnv || options['value-env'] || '';
    const hasInlineValue = options.value !== undefined && options.value !== null && options.value !== '';
    if (!valueEnv && hasInlineValue && selectorLooksSensitive(selector, as)) {
      throw new Error('refusing to persist likely secret fill value; use --value-env for password/token fields');
    }
    return {
      ...base,
      selector,
      ...(valueEnv ? { valueEnv } : { value: options.value || '' }),
      afterMs: positiveNumber(options.afterMs || options['after-ms'], 100, 'afterMs')
    };
  }

  if (type === 'click') {
    if (!selector) throw new Error('target-operate-add click requires --selector');
    return {
      ...base,
      selector,
      afterMs: positiveNumber(options.afterMs || options['after-ms'], 100, 'afterMs')
    };
  }

  if (type === 'wait-for') {
    const text = options.text || '';
    const urlIncludes = options.urlIncludes || options['url-includes'] || '';
    if (!selector && !text && !urlIncludes) throw new Error('target-operate-add wait-for requires --selector, --text, or --url-includes');
    return {
      ...base,
      ...(selector ? { selector } : {}),
      ...(text ? { text } : {}),
      ...(urlIncludes ? { urlIncludes } : {}),
      timeoutMs: positiveNumber(options.timeoutMs || options['timeout-ms'], 5000, 'timeoutMs'),
      pollMs: positiveNumber(options.pollMs || options['poll-ms'], 100, 'pollMs')
    };
  }

  if (type === 'wait') {
    return {
      ...base,
      ms: positiveNumber(options.ms, 250, 'ms')
    };
  }

  if (type === 'observe') {
    return {
      ...base,
      linkLimit: positiveNumber(options.linkLimit || options['link-limit'], 25, 'linkLimit'),
      controlLimit: positiveNumber(options.controlLimit || options['control-limit'], 40, 'controlLimit'),
      textLimit: positiveNumber(options.textLimit || options['text-limit'], 600, 'textLimit')
    };
  }

  if (type === 'inspect') {
    return {
      ...base,
      candidateLimit: positiveNumber(options.candidateLimit || options['candidate-limit'], 20, 'candidateLimit'),
      sampleLimit: positiveNumber(options.sampleLimit || options['sample-limit'], 3, 'sampleLimit')
    };
  }

  if (type === 'extract') {
    if (!selector) throw new Error('target-operate-add extract requires --selector');
    return {
      ...base,
      selector,
      fields: parseCsv(options.fields || 'text,href'),
      limit: positiveNumber(options.limit, 50, 'limit')
    };
  }

  throw new Error(`unsupported target-operate-add action: ${type}`);
}

export function addTargetOperateStep(targetDir, action, options = {}) {
  if (!targetDir) throw new Error('target-operate-add requires a target pack directory');
  const pack = resolveTargetPack(targetDir);
  const recipeFile = path.join(pack.dir, 'recipes', options.recipe || 'operate.json');
  let recipe;
  if (fs.existsSync(recipeFile)) {
    recipe = JSON.parse(fs.readFileSync(recipeFile, 'utf8'));
  } else {
    if (!pack.metadata.pageUrl) throw new Error(`target pageUrl not found: ${pack.metadataFile}`);
    recipe = {
      url: pack.metadata.pageUrl,
      steps: [
        { type: 'observe', as: 'before', linkLimit: 25, controlLimit: 40, textLimit: 600 },
        { type: 'inspect', as: 'candidates', candidateLimit: 20, sampleLimit: 3 }
      ]
    };
  }
  if (!Array.isArray(recipe.steps)) recipe.steps = [];
  const step = normalizeOperateStep(action, options);
  const allowedOrigins = pack.targetPolicy.allowedOrigins || [];
  for (const item of recipeUrls({ ...recipe, steps: [step] })) {
    if (!urlAllowed(item.url, allowedOrigins)) throw new Error(`blocked URL by target policy: ${item.url}`);
  }
  const beforeCount = recipe.steps.length;
  recipe.steps.push(step);
  if (!options.dryRun && !options['dry-run']) {
    fs.mkdirSync(path.dirname(recipeFile), { recursive: true });
    writeJson(recipeFile, recipe);
  }
  return {
    target: pack.metadata.target || path.basename(pack.dir),
    recipe: recipeFile,
    beforeCount,
    afterCount: recipe.steps.length,
    dryRun: Boolean(options.dryRun || options['dry-run']),
    added: sanitizeOperateStep(step),
    inlineValuePersisted: Object.hasOwn(step, 'value'),
    secretValuesRead: false,
    destructiveActionsIncluded: ['fill', 'click'].includes(step.type),
    next: `node src/cli.mjs target-run ${pack.dir} operate --daemon`
  };
}

function recipeUrls(recipe) {
  const urls = [];
  if (recipe.url) urls.push({ kind: 'recipe.url', url: recipe.url });
  for (const [index, url] of (recipe.urls || []).entries()) {
    urls.push({ kind: `urls[${index}]`, url });
  }
  for (const [index, step] of (recipe.steps || []).entries()) {
    if (step.url) urls.push({ kind: `steps[${index}].url`, url: step.url });
    if ((step.type || step.action) === 'search') {
      const provider = step.provider || recipe.provider || 'duckduckgo';
      const origin = SEARCH_PROVIDER_ORIGINS[provider];
      urls.push({ kind: `steps[${index}].search`, url: origin || `unsupported:${provider}` });
    }
  }
  return urls;
}

function check(level, name, ok, detail = '') {
  return { level: ok ? 'pass' : level, name, ok, detail };
}

export function doctorTargetPack(targetDir) {
  const checks = [];
  let pack;
  try {
    pack = resolveTargetPack(targetDir);
    checks.push(check('error', 'pack.resolves', true, pack.dir));
  } catch (error) {
    return { ok: false, checks: [check('error', 'pack.resolves', false, error.message)] };
  }

  const policy = pack.targetPolicy;
  const allowedOrigins = policy.allowedOrigins || [];
  checks.push(check('error', 'policy.allowedOrigins', allowedOrigins.length > 0, `${allowedOrigins.length} origin(s)`));
  checks.push(check('error', 'policy.chromeAllowed', (policy.allowedEngines || []).includes('chrome'), 'chrome must be allowed for authenticated CDP profiles'));
  checks.push(check('error', 'policy.authenticatedChrome', (policy.authenticatedEngines || []).includes('chrome'), 'chrome must be allowed for authenticated profiles'));
  checks.push(check('error', 'metadata.loginUrlAllowed', urlAllowed(pack.metadata.loginUrl, allowedOrigins), pack.metadata.loginUrl || 'missing'));
  try {
    const permissions = resolveTargetPermissions(targetDir, 'plan');
    checks.push(check('error', 'metadata.permissions.names', true, permissions.allow.join(',') || 'none'));
    for (const origin of permissions.origins) {
      checks.push(check('error', 'metadata.permissions.origin.allowed', urlAllowed(origin, allowedOrigins), origin));
    }
  } catch (error) {
    checks.push(check('error', 'metadata.permissions', false, error.message));
  }

  const recipesDir = path.join(pack.dir, 'recipes');
  for (const recipeFile of ['diagnose.json', 'observe.json', 'inspect.json', 'analyze.json', 'screenshot.json', 'crawl.json', 'outline.json', 'scrape-links.json', 'search.json']) {
    const fullPath = path.join(recipesDir, recipeFile);
    const exists = fs.existsSync(fullPath);
    checks.push(check('error', `recipe.${recipeFile}.exists`, exists, fullPath));
    if (!exists) continue;
    try {
      const recipe = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      for (const item of recipeUrls(recipe)) {
        checks.push(check('error', `recipe.${recipeFile}.${item.kind}.allowed`, urlAllowed(item.url, allowedOrigins), item.url));
      }
    } catch (error) {
      checks.push(check('error', `recipe.${recipeFile}.json`, false, error.message));
    }
  }
  for (const recipeFile of ['operate.json']) {
    const fullPath = path.join(recipesDir, recipeFile);
    if (!fs.existsSync(fullPath)) continue;
    checks.push(check('warning', `recipe.${recipeFile}.exists`, true, fullPath));
    try {
      const recipe = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      for (const item of recipeUrls(recipe)) {
        checks.push(check('error', `recipe.${recipeFile}.${item.kind}.allowed`, urlAllowed(item.url, allowedOrigins), item.url));
      }
    } catch (error) {
      checks.push(check('error', `recipe.${recipeFile}.json`, false, error.message));
    }
  }

  return {
    ok: checks.every((item) => item.ok || item.level !== 'error'),
    checks
  };
}
