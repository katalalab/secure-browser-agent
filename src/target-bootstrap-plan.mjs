import { safeTargetName } from './target-pack.mjs';
import { isRealExternalOrigin } from './target-proof.mjs';

function csv(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function normalizeOrigin(value, blockers) {
  try {
    return new URL(value).origin;
  } catch {
    blockers.push(`Invalid origin or URL: ${value}`);
    return '';
  }
}

function originFromUrl(value, blockers) {
  if (!value || String(value).startsWith('<')) return '';
  try {
    return new URL(value).origin;
  } catch {
    blockers.push(`Invalid URL: ${value}`);
    return '';
  }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function defaultUrl(origin, suffix, placeholder) {
  if (!origin) return placeholder;
  return new URL(suffix, origin).toString();
}

function addOptional(args, flag, value) {
  if (value && !String(value).startsWith('<')) args.push(flag, value);
}

function step(id, title, writes, args, status = 'ready') {
  return {
    id,
    title,
    writes,
    status,
    command: command(args)
  };
}

export function buildTargetBootstrapPlan(options = {}) {
  const blockers = [];
  let target = '';
  try {
    target = safeTargetName(options.name || options.target || '');
  } catch {
    blockers.push('Target name is required. Pass --name with a filesystem-safe service identifier.');
  }

  const inputOrigins = csv(options.origin || options.origins).map((origin) => normalizeOrigin(origin, blockers));
  const explicitLoginUrl = options.loginUrl || options['login-url'] || '';
  const explicitPageUrl = options.pageUrl || options['page-url'] || '';
  const derivedOrigins = [
    originFromUrl(explicitLoginUrl, blockers),
    originFromUrl(explicitPageUrl, blockers)
  ];
  const origins = unique([...inputOrigins, ...derivedOrigins]);
  const primaryOrigin = origins[0] || '';
  const loginUrl = explicitLoginUrl || defaultUrl(primaryOrigin, '/login', '<login-url>');
  const pageUrl = explicitPageUrl || primaryOrigin || '<page-url>';
  const query = options.query || (target ? `${target} docs` : '<search-query>');
  const permissions = options.permissions || 'clipboard,downloads';
  const searchProvider = options.searchProvider || options['search-provider'] || 'duckduckgo';
  const targetDir = target ? `runs/target-packs/${target}` : 'runs/target-packs/<target-name>';

  if (origins.length === 0) {
    blockers.push('At least one real external origin is required. Pass --origin https://service.example.');
  }
  const nonExternal = origins.filter((origin) => !isRealExternalOrigin(origin));
  if (nonExternal.length > 0) {
    blockers.push(`Origins must be real external http(s) services, not local/example/test/private origins: ${nonExternal.join(', ')}`);
  }
  const loginOrigin = originFromUrl(loginUrl, []);
  const pageOrigin = originFromUrl(pageUrl, []);
  const missingUrlOrigins = [loginOrigin, pageOrigin]
    .filter(Boolean)
    .filter((origin) => !origins.includes(origin));
  if (missingUrlOrigins.length > 0) {
    blockers.push(`Login/page URL origins must be included in --origin: ${unique(missingUrlOrigins).join(', ')}`);
  }

  const ready = blockers.length === 0;
  const scaffoldArgs = [
    'node',
    'src/cli.mjs',
    'scaffold-target',
    target || '<target-name>',
    '--origin',
    origins.join(',') || '<https://service.example>',
    '--permissions',
    permissions,
    '--search-provider',
    searchProvider
  ];
  addOptional(scaffoldArgs, '--login-url', loginUrl);
  addOptional(scaffoldArgs, '--page-url', pageUrl);
  addOptional(scaffoldArgs, '--query', query);

  const gatedStatus = ready ? 'ready' : 'blocked';
  const commands = [
    step('scaffold-target', 'Create the target pack with allowlisted real external origins', true, scaffoldArgs, gatedStatus),
    step('login', 'Open the dedicated headed Chrome profile and complete operator-owned login', true, ['node', 'src/cli.mjs', 'target-login', targetDir, '--real-external'], gatedStatus),
    step('login-capture', 'Open login browser, wait for auth-check, and capture proof with low-token wait status', true, ['node', 'src/cli.mjs', 'target-login-capture', targetDir, '--real-external', '--handoff-out', 'operator-handoff.json', '--wait-auth-status-out', 'wait-auth-status.json', '--format', 'markdown'], gatedStatus),
    step('secret-run-select-login-capture', 'Select the safest available 1Password op-run wrapper for the login-capture command', false, ['node', 'src/cli.mjs', 'secret-run-select', '--command', 'target-login-capture', '--target-dir', targetDir, '--format', 'compact'], gatedStatus),
    step('audit', 'Verify the target pack and profile boundary before automation', false, ['node', 'src/cli.mjs', 'target-audit', targetDir], gatedStatus),
    step('permissions', 'Apply pack-scoped Chrome permissions after the login browser is closed', true, ['node', 'src/cli.mjs', 'target-permissions', targetDir, 'apply'], gatedStatus),
    step('start-daemon', 'Start reusable background Chrome/CDP for the target profile', true, ['node', 'src/cli.mjs', 'target-daemon', targetDir, 'start'], gatedStatus),
    step('auth-check', 'Write page-level proof that the target page is not still a login screen', true, ['node', 'src/cli.mjs', 'target-auth-check', targetDir, '--write', '--daemon', '--strict', '--format', 'json'], gatedStatus),
    step('observe', 'Capture compact page structure without page rows or credential material', true, ['node', 'src/cli.mjs', 'target-run', targetDir, 'observe', '--daemon'], gatedStatus),
    step('inspect', 'Capture scraping candidates and structural hints', true, ['node', 'src/cli.mjs', 'target-run', targetDir, 'inspect', '--daemon'], gatedStatus),
    step('scrape', 'Write the default CSV scrape output under the target pack', true, ['node', 'src/cli.mjs', 'target-scrape', targetDir, '--daemon'], gatedStatus),
    step('benchmark', 'Write target benchmark proof JSON under the target pack', true, ['node', 'src/cli.mjs', 'target-benchmark', targetDir, '--write', '--out', 'proof/target-benchmark.json', '--format', 'json'], gatedStatus),
    step('write-proof', 'Write the secret-free accepted target proof summary', true, ['node', 'src/cli.mjs', 'target-proof', targetDir, '--real-external', '--write', '--auth-check-file', `${targetDir}/proof/auth-check.json`, '--benchmark-file', `${targetDir}/proof/target-benchmark.json`], gatedStatus),
    step('readiness', 'Confirm readiness now accepts the real external proof', false, ['node', 'src/cli.mjs', 'readiness-audit', '--format', 'markdown'], 'ready')
  ];

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    safeMode: true,
    destructiveActionsIncluded: false,
    localWritesIncluded: true,
    ready,
    target: target || '',
    targetDir,
    origins,
    loginUrl,
    pageUrl,
    query,
    permissions: csv(permissions),
    searchProvider,
    blockers,
    commands
  };
}

function commandById(plan, id) {
  return plan.commands.find((item) => item.id === id)?.command?.shell || 'none';
}

function safeOrigin(value) {
  if (!value || String(value).startsWith('<')) return 'none';
  try {
    return new URL(value).origin;
  } catch {
    return 'invalid';
  }
}

export function formatTargetBootstrapPlanCompact(plan) {
  const lines = [
    `safe_mode: ${plan.safeMode ? 'yes' : 'no'}`,
    `destructive_actions: ${plan.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `local_writes_included: ${plan.localWritesIncluded ? 'yes' : 'no'}`,
    `ready: ${plan.ready ? 'yes' : 'no'}`,
    `target: ${plan.target || 'none'}`,
    `target_dir: ${plan.targetDir}`,
    `origin_count: ${plan.origins.length}`,
    `origins: ${plan.origins.join(',') || 'none'}`,
    `login_url_origin: ${safeOrigin(plan.loginUrl)}`,
    `page_url_origin: ${safeOrigin(plan.pageUrl)}`,
    `permissions: ${plan.permissions.join(',') || 'none'}`,
    `search_provider: ${plan.searchProvider}`,
    `blockers_count: ${plan.blockers.length}`,
    `blockers: ${plan.blockers.length ? plan.blockers.join(' | ') : 'none'}`,
    `scaffold_command: ${commandById(plan, 'scaffold-target')}`,
    `login_capture_command: ${commandById(plan, 'login-capture')}`,
    `secret_run_select_command: ${commandById(plan, 'secret-run-select-login-capture')}`,
    `auth_check_command: ${commandById(plan, 'auth-check')}`,
    `observe_command: ${commandById(plan, 'observe')}`,
    `inspect_command: ${commandById(plan, 'inspect')}`,
    `scrape_command: ${commandById(plan, 'scrape')}`,
    `benchmark_command: ${commandById(plan, 'benchmark')}`,
    `write_proof_command: ${commandById(plan, 'write-proof')}`,
    `readiness_command: ${commandById(plan, 'readiness')}`,
    `next: ${plan.ready ? 'run scaffold_command, then run secret_run_select_command or login_capture_command after operator approval' : 'fix blockers before creating target pack'}`
  ];
  return `${lines.join('\n')}\n`;
}

export function formatTargetBootstrapPlanMarkdown(plan) {
  const lines = [
    '# Secure Browser Agent Target Bootstrap Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    `Target: ${plan.target || 'missing'}`,
    `Target directory: ${plan.targetDir}`,
    `Ready: ${plan.ready ? 'yes' : 'no'}`,
    `Safe mode: ${plan.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${plan.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Local writes included in commands: ${plan.localWritesIncluded ? 'yes' : 'no'}`,
    '',
    '## Target Inputs',
    '',
    `- Origins: ${plan.origins.join(', ') || 'none'}`,
    `- Login URL: ${plan.loginUrl}`,
    `- Page URL: ${plan.pageUrl}`,
    `- Query: ${plan.query}`,
    `- Permissions: ${plan.permissions.join(', ') || 'none'}`,
    `- Search provider: ${plan.searchProvider}`,
    '',
    '## Blockers',
    ''
  ];
  if (plan.blockers.length === 0) {
    lines.push('- none');
  } else {
    for (const blocker of plan.blockers) lines.push(`- ${blocker}`);
  }
  lines.push('', '## Commands', '');
  for (const item of plan.commands) {
    lines.push(`### ${item.id}`);
    lines.push(`- ${item.title}`);
    lines.push(`- Status: ${item.status}`);
    lines.push(`- Writes local state: ${item.writes ? 'yes' : 'no'}`);
    lines.push('');
    lines.push('```bash');
    lines.push(item.command.shell);
    lines.push('```');
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
