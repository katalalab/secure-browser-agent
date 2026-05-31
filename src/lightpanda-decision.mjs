import fs from 'node:fs';
import path from 'node:path';
import { buildLightpandaDoctor } from './lightpanda-doctor.mjs';

function safeRunsArtifactPath(rootDir, outPath) {
  const runsDir = path.resolve(rootDir, 'runs');
  const target = path.resolve(runsDir, outPath || path.join('provider-benchmarks', 'lightpanda-decision.json'));
  const relative = path.relative(runsDir, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Lightpanda decision output must stay under runs/: ${outPath}`);
  }
  return target;
}

function failingChecks(doctor) {
  return (doctor.checks || [])
    .filter((check) => check.status !== 'pass' && check.status !== 'recommend')
    .map((check) => ({
      name: check.name,
      status: check.status,
      detail: check.detail
    }));
}

function defaultReason(decision, doctor) {
  if (decision === 'adopt') return 'Lightpanda is adopted for public unauthenticated crawling after local proof.';
  if (!doctor.binary?.exists) return 'Lightpanda is rejected on this Mac for now because no executable is available.';
  if (!doctor.readyForPublicBenchmark) return 'Lightpanda is rejected on this Mac for now because the local binary is not benchmark-ready.';
  return 'Lightpanda is rejected for public crawling by operator decision.';
}

export function buildLightpandaDecision(options = {}) {
  const decision = options.decision || 'reject';
  if (!['adopt', 'reject'].includes(decision)) {
    throw new Error(`lightpanda decision must be adopt or reject: ${decision}`);
  }
  const doctor = options.doctor || buildLightpandaDoctor(options.doctorOptions || {});
  if (decision === 'adopt' && !doctor.readyForPublicBenchmark && !options.force) {
    throw new Error('Lightpanda cannot be adopted without a benchmark-ready executable; pass a benchmark proof instead.');
  }
  const reason = options.reason || defaultReason(decision, doctor);
  const result = decision === 'adopt' ? 'proved' : 'rejected';
  return {
    schemaVersion: 1,
    type: 'lightpanda-public-decision',
    provider: 'lightpanda',
    generatedAt: options.generatedAt || new Date().toISOString(),
    publicOnly: true,
    secretFree: true,
    decision,
    result,
    ok: true,
    adopted: decision === 'adopt',
    reason,
    evidence: {
      doctor: {
        readyForPublicBenchmark: Boolean(doctor.readyForPublicBenchmark),
        readyForSourceBuild: Boolean(doctor.readyForSourceBuild),
        binaryExists: Boolean(doctor.binary?.exists),
        binaryPath: doctor.binary?.path || '',
        version: doctor.binary?.version || '',
        sourceCloneExists: Boolean(doctor.source?.cloneExists),
        sourceCloneDir: doctor.source?.cloneDir || '',
        minimumZigVersion: doctor.source?.minimumZigVersion || '',
        failingChecks: failingChecks(doctor)
      },
      benchmarkCommand: doctor.benchmarkCommand || ''
    },
    next: decision === 'adopt'
      ? 'Keep Lightpanda public-profile only until target-pack compatibility is proven.'
      : 'Keep direct CDP Chrome as the default; re-run lightpanda-doctor if a binary is installed later.'
  };
}

export function writeLightpandaDecision(rootDir, report, outPath = '') {
  const target = safeRunsArtifactPath(rootDir, outPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return target;
}

export function formatLightpandaDecisionMarkdown(report) {
  const lines = [
    '# Secure Browser Agent Lightpanda Decision',
    '',
    `Generated: ${report.generatedAt}`,
    `Provider: ${report.provider}`,
    `Decision: ${report.decision}`,
    `Result: ${report.result}`,
    `Public only: ${report.publicOnly ? 'yes' : 'no'}`,
    `Secret-free: ${report.secretFree ? 'yes' : 'no'}`,
    '',
    '## Reason',
    '',
    `- ${report.reason}`,
    '',
    '## Doctor Evidence',
    '',
    `- Ready for public benchmark: ${report.evidence.doctor.readyForPublicBenchmark ? 'yes' : 'no'}`,
    `- Ready for source build: ${report.evidence.doctor.readyForSourceBuild ? 'yes' : 'no'}`,
    `- Binary: ${report.evidence.doctor.binaryExists ? report.evidence.doctor.binaryPath : 'missing'}`,
    `- Version: ${report.evidence.doctor.version || 'unknown'}`,
    `- Source clone: ${report.evidence.doctor.sourceCloneExists ? report.evidence.doctor.sourceCloneDir : 'missing'}`,
    `- Minimum Zig: ${report.evidence.doctor.minimumZigVersion || 'unknown'}`
  ];
  if (report.evidence.doctor.failingChecks.length) {
    lines.push('', '## Failing Checks', '');
    for (const check of report.evidence.doctor.failingChecks) {
      lines.push(`- ${check.name}: ${check.status} - ${check.detail}`);
    }
  }
  if (report.outputPath) {
    lines.push('', `Written: ${report.outputPath}`);
  }
  lines.push('', '## Next', '', `- ${report.next}`, '');
  return lines.join('\n');
}
