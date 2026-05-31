import fs from 'node:fs';
import path from 'node:path';

const CANDIDATES = [
  {
    id: 'github',
    label: 'GitHub',
    description: 'Developer account target with predictable authenticated pages and low-risk read-only structure checks.',
    name: 'github',
    origins: ['https://github.com'],
    loginUrl: 'https://github.com/login',
    pageUrl: 'https://github.com/dashboard',
    query: 'github dashboard',
    permissions: []
  },
  {
    id: 'google-drive',
    label: 'Google Drive',
    description: 'Document workspace target; useful for authenticated navigation and list-page structure checks.',
    name: 'google-drive',
    origins: ['https://drive.google.com', 'https://accounts.google.com'],
    loginUrl: 'https://accounts.google.com/',
    pageUrl: 'https://drive.google.com/drive/my-drive',
    query: 'google drive files',
    permissions: ['downloads']
  },
  {
    id: 'notion',
    label: 'Notion',
    description: 'Workspace app target; useful for authenticated SPA navigation and page-structure analysis.',
    name: 'notion',
    origins: ['https://www.notion.so'],
    loginUrl: 'https://www.notion.so/login',
    pageUrl: 'https://www.notion.so/',
    query: 'notion workspace',
    permissions: ['clipboard']
  }
];

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/target-candidate-plan-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid target candidate plan output path: ${outPath}`);
  return outputPath;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJsonStatus(filePath) {
  try {
    const stat = fs.statSync(filePath);
    try {
      return {
        exists: true,
        parseOk: true,
        value: JSON.parse(fs.readFileSync(filePath, 'utf8')),
        ageSeconds: Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 1000)),
        error: ''
      };
    } catch (error) {
      return {
        exists: true,
        parseOk: false,
        value: null,
        ageSeconds: Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 1000)),
        error: error.message
      };
    }
  } catch (error) {
    return {
      exists: false,
      parseOk: false,
      value: null,
      ageSeconds: null,
      error: error.code === 'ENOENT' ? 'missing' : error.message
    };
  }
}

function readJsonValue(filePath) {
  const status = readJsonStatus(filePath);
  return status.exists && status.parseOk ? status.value : null;
}

function firstJsonValue(paths) {
  for (const filePath of paths) {
    const status = readJsonStatus(filePath);
    if (status.exists) {
      return {
        path: filePath,
        exists: true,
        parseOk: status.parseOk,
        value: status.parseOk ? status.value : null
      };
    }
  }
  return { path: '', exists: false, parseOk: false, value: null };
}

function candidateReadiness(rootDir, candidate) {
  const targetDir = path.join(rootDir, 'runs', 'target-packs', candidate.name);
  const targetJson = readJsonStatus(path.join(targetDir, 'target.json'));
  const policyJson = readJsonStatus(path.join(targetDir, 'policy.json'));
  const authCheck = firstJsonValue([
    path.join(targetDir, 'proof', 'auth-check.json'),
    path.join(targetDir, 'outputs', 'auth-check.json'),
    path.join(targetDir, 'outputs', 'auth-check-status.json'),
    path.join(targetDir, 'outputs', 'auth-check-status-latest.json')
  ]);
  const benchmark = firstJsonValue([
    path.join(targetDir, 'proof', 'target-benchmark.json'),
    path.join(targetDir, 'outputs', 'target-benchmark.json'),
    path.join(targetDir, 'outputs', 'benchmark.json')
  ]);
  const proofPath = path.join(targetDir, 'proof', 'target-proof.json');
  const proof = readJsonValue(proofPath);
  const proofStatus = readJsonStatus(proofPath);
  const metadataOk = targetJson.exists && targetJson.parseOk && policyJson.exists && policyJson.parseOk;
  const authCheckOk = Boolean(authCheck.value?.ok);
  const authCheckLoginLike = authCheck.value?.loginLike ?? null;
  const benchmarkOk = Boolean(
    benchmark.value?.preflight?.ok &&
      Array.isArray(benchmark.value?.results) &&
      benchmark.value.results.some((item) => item?.ok)
  );
  const proofAccepted = Boolean(
    proof?.ok &&
      proof?.realExternal &&
      proof?.authCheck?.ok &&
      proof?.authCheck?.loginLike === false &&
      proof?.benchmark?.ok
  );
  const targetPackExists = fs.existsSync(targetDir);
  const proofReady = targetPackExists && metadataOk && authCheckOk && authCheckLoginLike === false && benchmarkOk;
  let nextAction = 'write-target-proof';
  if (proofAccepted) nextAction = 'accepted-proof-complete';
  else if (!targetPackExists) nextAction = 'scaffold-target-pack';
  else if (!metadataOk) nextAction = 'fix-target-pack-metadata';
  else if (!authCheckOk || authCheckLoginLike !== false) nextAction = 'operator-login-and-auth-check';
  else if (!benchmarkOk) nextAction = 'run-target-benchmark';
  return {
    targetPackExists,
    targetPackDir: targetDir,
    metadataOk,
    targetJsonExists: targetJson.exists,
    targetJsonParseOk: targetJson.parseOk,
    policyJsonExists: policyJson.exists,
    policyJsonParseOk: policyJson.parseOk,
    authCheckExists: authCheck.exists,
    authCheckParseOk: authCheck.parseOk,
    authCheckOk,
    authCheckLoginLike,
    benchmarkExists: benchmark.exists,
    benchmarkParseOk: benchmark.parseOk,
    benchmarkOk,
    proofExists: proofStatus.exists,
    proofParseOk: proofStatus.parseOk,
    proofReady,
    proofAccepted,
    nextAction
  };
}

function candidateCommand(candidate) {
  const args = [
    'node',
    'src/cli.mjs',
    'target-bootstrap-plan',
    '--name',
    candidate.name,
    '--origin',
    candidate.origins.join(','),
    '--login-url',
    candidate.loginUrl,
    '--page-url',
    candidate.pageUrl,
    '--query',
    candidate.query,
    '--format',
    'markdown'
  ];
  if (candidate.permissions.length) {
    args.push('--permissions', candidate.permissions.join(','));
  }
  return command(args);
}

function candidateCompactCommand(candidate) {
  const args = [
    'node',
    'src/cli.mjs',
    'target-bootstrap-plan',
    '--name',
    candidate.name,
    '--origin',
    candidate.origins.join(','),
    '--login-url',
    candidate.loginUrl,
    '--page-url',
    candidate.pageUrl,
    '--query',
    candidate.query,
    '--format',
    'compact'
  ];
  if (candidate.permissions.length) {
    args.push('--permissions', candidate.permissions.join(','));
  }
  return command(args);
}

export function buildTargetCandidatePlan(options = {}) {
  const only = options.candidate || options.id || '';
  const rootDir = options.rootDir || process.cwd();
  const candidates = CANDIDATES
    .filter((candidate) => !only || candidate.id === only || candidate.name === only)
    .map((candidate) => ({
      ...candidate,
      realExternal: true,
      writesLocalState: false,
      needsOperatorApproval: true,
      readiness: candidateReadiness(rootDir, candidate),
      bootstrapPlanCommand: candidateCommand(candidate),
      bootstrapPlanCompactCommand: candidateCompactCommand(candidate)
    }));
  if (only && candidates.length === 0) {
    throw new Error(`unknown target candidate: ${only}`);
  }
  const recommended = candidates.find((candidate) => candidate.id === 'github') || candidates[0] || null;
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    safeMode: true,
    destructiveActionsIncluded: false,
    writesLocalState: false,
    rootDir,
    selectedCandidate: only || '',
    recommendedCandidate: recommended?.id || '',
    next: recommended
      ? 'Run the recommended bootstrap plan command, review it, then run scaffold/login/capture commands after operator approval.'
      : 'Choose a candidate or pass --candidate <id>.',
    candidates
  };
}

export function writeTargetCandidatePlan(rootDir, plan, outPath = 'operator/target-candidate-plan-latest.json') {
  const outputPath = safeRunPath(rootDir, outPath);
  writeJson(outputPath, plan);
  return outputPath;
}

export function buildTargetCandidatePlanStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inPath = safeRunPath(rootDir, options.in || options.input || 'operator/target-candidate-plan-latest.json');
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? options['stale-after-seconds'] ?? 900);
  const saved = readJsonStatus(inPath);
  const stale = !saved.exists || !saved.parseOk || (Number.isFinite(staleAfterSeconds) && staleAfterSeconds >= 0 && saved.ageSeconds !== null && saved.ageSeconds > staleAfterSeconds);
  const plan = saved.parseOk ? saved.value : {};
  const refreshCommand = command([
    'node',
    'src/cli.mjs',
    'target-candidate-plan-watch',
    '--run',
    '--in',
    path.relative(path.resolve(rootDir, 'runs'), inPath),
    '--out',
    path.relative(path.resolve(rootDir, 'runs'), inPath),
    ...(plan.selectedCandidate ? ['--candidate', plan.selectedCandidate] : []),
    '--format',
    'compact'
  ]);
  return {
    schemaVersion: 1,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    inputPath: inPath,
    exists: saved.exists,
    parseOk: saved.parseOk,
    stale,
    ageSeconds: saved.ageSeconds,
    staleAfterSeconds,
    error: saved.error,
    selectedCandidate: plan.selectedCandidate || '',
    recommendedCandidate: plan.recommendedCandidate || '',
    candidateCount: Array.isArray(plan.candidates) ? plan.candidates.length : 0,
    candidateIds: Array.isArray(plan.candidates) ? plan.candidates.map((candidate) => candidate.id) : [],
    candidateReadiness: Array.isArray(plan.candidates)
      ? plan.candidates.map((candidate) => ({ id: candidate.id, ...(candidate.readiness || {}) }))
      : [],
    next: plan.next || (saved.exists ? 'refresh-target-candidate-plan' : 'create-target-candidate-plan'),
    agentSafeNextCommandId: stale ? 'target-candidate-plan-refresh' : 'none',
    agentSafeNextMayRunUnattended: stale,
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    refreshCommand
  };
}

export function buildTargetCandidatePlanWatch(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inRelative = options.in || options.input || 'operator/target-candidate-plan-latest.json';
  const outRelative = options.out || options.output || inRelative;
  const status = buildTargetCandidatePlanStatus({
    rootDir,
    in: inRelative,
    staleAfterSeconds: options.staleAfterSeconds ?? options['stale-after-seconds']
  });
  const runRequested = Boolean(options.run);
  const shouldRefresh = status.stale;
  const allowedToRun = runRequested && shouldRefresh;
  let refreshed = null;
  if (allowedToRun) {
    refreshed = buildTargetCandidatePlan({
      rootDir,
      candidate: options.candidate,
      generatedAt: options.generatedAt
    });
    writeTargetCandidatePlan(rootDir, refreshed, outRelative);
  }
  const after = refreshed
    ? buildTargetCandidatePlanStatus({
      rootDir,
      in: outRelative,
      staleAfterSeconds: options.staleAfterSeconds ?? options['stale-after-seconds']
    })
    : status;
  return {
    schemaVersion: 1,
    safeMode: true,
    statusOnly: false,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    runRequested,
    executed: Boolean(refreshed),
    status: refreshed ? 'refreshed' : shouldRefresh ? 'refresh-required' : 'fresh',
    inputPath: status.inputPath,
    outputPath: safeRunPath(rootDir, outRelative),
    stale: shouldRefresh,
    allowedToRun,
    blockedReason: !runRequested && shouldRefresh
      ? 'run-not-requested'
      : runRequested && !shouldRefresh
      ? 'saved-target-candidate-plan-is-fresh'
      : 'none',
    beforeExists: status.exists,
    beforeParseOk: status.parseOk,
    beforeStale: status.stale,
    afterExists: after.exists,
    afterParseOk: after.parseOk,
    afterStale: after.stale,
    afterRecommendedCandidate: after.recommendedCandidate || 'none',
    afterCandidateCount: after.candidateCount,
    refreshCommand: status.refreshCommand
  };
}

export function formatTargetCandidatePlanCompact(plan) {
  const recommended = plan.candidates.find((candidate) => candidate.id === plan.recommendedCandidate) || plan.candidates[0] || null;
  const lines = [
    `safe_mode: ${plan.safeMode ? 'yes' : 'no'}`,
    `destructive_actions: ${plan.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `writes_local_state: ${plan.writesLocalState ? 'yes' : 'no'}`,
    `selected_candidate: ${plan.selectedCandidate || 'none'}`,
    `recommended_candidate: ${plan.recommendedCandidate || 'none'}`,
    `candidate_count: ${plan.candidates.length}`,
    `candidate_ids: ${plan.candidates.map((candidate) => candidate.id).join(',') || 'none'}`,
    `recommended_bootstrap_plan_command: ${recommended?.bootstrapPlanCompactCommand?.shell || 'none'}`,
    `next: ${plan.next}`
  ];
  for (const candidate of plan.candidates) {
    const readiness = candidate.readiness || {};
    lines.push(`candidate_${candidate.id}_label: ${candidate.label}`);
    lines.push(`candidate_${candidate.id}_origins: ${candidate.origins.join(',')}`);
    lines.push(`candidate_${candidate.id}_target_pack_exists: ${yesNo(readiness.targetPackExists)}`);
    lines.push(`candidate_${candidate.id}_metadata_ok: ${yesNo(readiness.metadataOk)}`);
    lines.push(`candidate_${candidate.id}_auth_check_exists: ${yesNo(readiness.authCheckExists)}`);
    lines.push(`candidate_${candidate.id}_auth_check_ok: ${yesNo(readiness.authCheckOk)}`);
    lines.push(`candidate_${candidate.id}_auth_check_login_like: ${readiness.authCheckLoginLike ?? 'unknown'}`);
    lines.push(`candidate_${candidate.id}_benchmark_exists: ${yesNo(readiness.benchmarkExists)}`);
    lines.push(`candidate_${candidate.id}_benchmark_ok: ${yesNo(readiness.benchmarkOk)}`);
    lines.push(`candidate_${candidate.id}_proof_exists: ${yesNo(readiness.proofExists)}`);
    lines.push(`candidate_${candidate.id}_proof_ready: ${yesNo(readiness.proofReady)}`);
    lines.push(`candidate_${candidate.id}_proof_accepted: ${yesNo(readiness.proofAccepted)}`);
    lines.push(`candidate_${candidate.id}_next_action: ${readiness.nextAction || 'unknown'}`);
    lines.push(`candidate_${candidate.id}_bootstrap_plan_command: ${candidate.bootstrapPlanCompactCommand.shell}`);
  }
  return `${lines.join('\n')}\n`;
}

export function formatTargetCandidatePlanStatusCompact(status) {
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `exists: ${yesNo(status.exists)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `stale: ${yesNo(status.stale)}`,
    `age_seconds: ${status.ageSeconds ?? 'unknown'}`,
    `stale_after_seconds: ${status.staleAfterSeconds}`,
    `selected_candidate: ${status.selectedCandidate || 'none'}`,
    `recommended_candidate: ${status.recommendedCandidate || 'none'}`,
    `candidate_count: ${status.candidateCount}`,
    `candidate_ids: ${status.candidateIds.length ? status.candidateIds.join(',') : 'none'}`,
    `candidate_readiness: ${status.candidateReadiness?.length ? status.candidateReadiness.map((item) => `${item.id}:${item.nextAction || 'unknown'}`).join(',') : 'none'}`,
    `next: ${status.next}`,
    `agent_safe_next_command_id: ${status.agentSafeNextCommandId}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`
  ];
  if (status.refreshCommand?.shell) lines.push(`refresh_command: ${status.refreshCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatTargetCandidatePlanWatchCompact(watch) {
  const runsRoot = path.resolve(process.cwd(), 'runs');
  const lines = [
    `safe_mode: ${yesNo(watch.safeMode)}`,
    `status_only: ${yesNo(watch.statusOnly)}`,
    `destructive_actions: ${yesNo(watch.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(watch.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(watch.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(watch.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(watch.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(watch.pageContentReturned)}`,
    `run_requested: ${yesNo(watch.runRequested)}`,
    `executed: ${yesNo(watch.executed)}`,
    `status: ${watch.status}`,
    `input_path: ${path.relative(runsRoot, watch.inputPath) || watch.inputPath}`,
    `output_path: ${path.relative(runsRoot, watch.outputPath) || watch.outputPath}`,
    `stale: ${yesNo(watch.stale)}`,
    `allowed_to_run: ${yesNo(watch.allowedToRun)}`,
    `blocked_reason: ${watch.blockedReason}`,
    `before_exists: ${yesNo(watch.beforeExists)}`,
    `before_parse_ok: ${yesNo(watch.beforeParseOk)}`,
    `before_stale: ${yesNo(watch.beforeStale)}`,
    `after_exists: ${yesNo(watch.afterExists)}`,
    `after_parse_ok: ${yesNo(watch.afterParseOk)}`,
    `after_stale: ${yesNo(watch.afterStale)}`,
    `after_recommended_candidate: ${watch.afterRecommendedCandidate}`,
    `after_candidate_count: ${watch.afterCandidateCount}`
  ];
  if (watch.refreshCommand?.shell) lines.push(`refresh_command: ${watch.refreshCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatTargetCandidatePlanMarkdown(plan) {
  const lines = [
    '# Secure Browser Agent Target Candidate Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    `Safe mode: ${plan.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${plan.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Writes local state: ${plan.writesLocalState ? 'yes' : 'no'}`,
    `Recommended: ${plan.recommendedCandidate || 'none'}`,
    '',
    '## Candidates',
    ''
  ];
  for (const candidate of plan.candidates) {
    lines.push(`### ${candidate.id}`);
    lines.push('');
    lines.push(`- Label: ${candidate.label}`);
    lines.push(`- Description: ${candidate.description}`);
    lines.push(`- Origins: ${candidate.origins.join(', ')}`);
    lines.push(`- Login URL: ${candidate.loginUrl}`);
    lines.push(`- Page URL: ${candidate.pageUrl}`);
    lines.push(`- Needs operator approval: ${candidate.needsOperatorApproval ? 'yes' : 'no'}`);
    lines.push(`- Target pack exists: ${candidate.readiness?.targetPackExists ? 'yes' : 'no'}`);
    lines.push(`- Proof ready: ${candidate.readiness?.proofReady ? 'yes' : 'no'}`);
    lines.push(`- Proof accepted: ${candidate.readiness?.proofAccepted ? 'yes' : 'no'}`);
    lines.push(`- Next action: ${candidate.readiness?.nextAction || 'unknown'}`);
    lines.push('', '```bash');
    lines.push(candidate.bootstrapPlanCommand.shell);
    lines.push('```', '');
  }
  lines.push('## Next', '', `- ${plan.next}`, '');
  return `${lines.join('\n')}\n`;
}
