import path from 'node:path';
import { findProviderBenchmarkProofs, lightpandaPublicBenchmarkDecision } from './provider-benchmark.mjs';
import { toPosixPath } from './output.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compactValue(value) {
  if (value === undefined || value === null || value === '') return 'none';
  return String(value).replace(/\s+/g, ' ').trim() || 'none';
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return { args, shell: args.map(shellQuote).join(' ') };
}

export function buildLightpandaGate(rootDir = process.cwd(), options = {}) {
  const proofs = findProviderBenchmarkProofs(rootDir)
    .map((item) => ({
      path: item.path,
      decision: lightpandaPublicBenchmarkDecision(item.report)
    }))
    .filter((item) => item.decision);
  const adopted = proofs.find((item) => item.decision.adopted) || null;
  const rejected = proofs.find((item) => item.decision.result === 'rejected') || null;
  const accepted = Boolean(adopted);
  const source = adopted || rejected || null;
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    rootDir,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    authenticatedProfilesAllowed: false,
    accepted,
    status: accepted ? 'accepted' : source ? 'rejected' : 'missing-proof',
    proofCount: proofs.length,
    proofPath: source?.path || '',
    proofRelativePath: source ? toPosixPath(path.relative(rootDir, source.path)) : '',
    reason: source?.decision?.reason || 'No Lightpanda public benchmark or decision proof found.',
    benchmarkCommand: command(['node', 'src/cli.mjs', 'benchmark', '--url', 'https://example.com', '--iterations', '1', '--write', '--out', 'provider-benchmarks/lightpanda-public.json', '--format', 'json']),
    decisionCommand: command(['node', 'src/cli.mjs', 'lightpanda-decision', '--decision', 'adopt', '--reason', '<benchmark-result>', '--write', '--format', 'markdown'])
  };
}

export function formatLightpandaGateCompact(gate) {
  const lines = [
    `safe_mode: ${yesNo(gate.safeMode)}`,
    `status_only: ${yesNo(gate.statusOnly)}`,
    `destructive_actions: ${yesNo(gate.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(gate.secretValuesRead)}`,
    `authenticated_profiles_allowed: ${yesNo(gate.authenticatedProfilesAllowed)}`,
    `status: ${compactValue(gate.status)}`,
    `accepted: ${yesNo(gate.accepted)}`,
    `proof_count: ${gate.proofCount}`,
    `proof: ${compactValue(gate.proofRelativePath || gate.proofPath)}`,
    `reason: ${compactValue(gate.reason)}`,
    `benchmark_command: ${gate.benchmarkCommand.shell}`,
    `decision_command: ${gate.decisionCommand.shell}`,
    ''
  ];
  return `${lines.join('\n')}\n`;
}
