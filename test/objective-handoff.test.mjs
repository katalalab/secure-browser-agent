import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildObjectiveHandoff, formatObjectiveHandoffCompact, formatObjectiveHandoffMarkdown } from '../src/objective-handoff.mjs';

const missingProofArtifacts = [
  { id: 'auth-check', kind: 'proof', path: 'proof/auth-check.json', detail: 'auth-check proof is missing or still login-like' },
  { id: 'output:observe.json', kind: 'output', path: 'observe.json', detail: 'required output file is missing or empty' },
  { id: 'output:scrape.csv', kind: 'output', path: 'scrape.csv', detail: 'required output file is missing or empty' },
  { id: 'benchmark', kind: 'proof', path: 'proof/target-benchmark.json', detail: 'target benchmark proof is missing or has no successful run' }
];

function auditFixture() {
  return {
    objective: 'Fast secure browser automation.',
    complete: false,
    status: 'incomplete',
    safeMode: true,
    destructiveActionsIncluded: false,
    finalGate: { remainingCount: 1 },
    remaining: [
      {
        id: 'real-external-auth-target',
        status: 'manual-required',
        next: 'Complete operator login and capture proof.'
      }
    ],
    nextAction: {
      id: 'target-login-capture',
      label: 'Open login and capture proof',
      command: {
        shell: "'node' 'src/cli.mjs' 'target-login-capture' 'runs/target-packs/github' '--real-external'"
      },
      operatorGuidance: {
        humanAction: 'run-login-capture-wait',
        automationBlocker: 'operator-login-required',
        captureBlocked: true
      },
      nextArtifactAction: 'wait-auth-then-capture-proof',
      nextArtifactBlocker: 'operator-login-required',
      artifactCommandCovers: ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof'],
      missingArtifacts: missingProofArtifacts,
      manualCommands: [
        "'node' 'src/cli.mjs' 'target-login-capture' 'runs/target-packs/github' '--real-external' '--open-only'"
      ]
    }
  };
}

test('objective handoff summarizes the current operator action and completion gate', async () => {
  const handoff = await buildObjectiveHandoff({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-28T00:00:00.000Z',
    audit: auditFixture()
  });

  assert.equal(handoff.complete, false);
  assert.equal(handoff.status, 'action-required');
  assert.deepEqual(handoff.remaining.map((item) => item.id), ['real-external-auth-target']);
  assert.deepEqual(handoff.missingArtifacts.map((item) => item.id), ['auth-check', 'output:observe.json', 'output:scrape.csv', 'benchmark']);
  assert.equal(handoff.artifactAction.nextArtifactAction, 'wait-auth-then-capture-proof');
  assert.equal(handoff.artifactAction.nextArtifactBlocker, 'operator-login-required');
  assert.deepEqual(handoff.artifactAction.artifactCommandCovers, ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof']);
  assert.deepEqual(handoff.commands.map((item) => item.id), ['primary-action', 'objective-status', 'proof-gate-watch', 'manual-candidate-1', 'completion-audit', 'objective-next']);
  assert.match(handoff.instructions.join('\n'), /Do not paste credentials/);
  const markdown = formatObjectiveHandoffMarkdown(handoff);
  assert.match(markdown, /Objective Handoff/);
  assert.match(markdown, /target-login-capture/);
  assert.match(markdown, /Human action: run-login-capture-wait/);
  assert.match(markdown, /Automation blocker: operator-login-required/);
  assert.match(markdown, /Capture blocked: yes/);
  assert.match(markdown, /Next artifact action: wait-auth-then-capture-proof/);
  assert.match(markdown, /Missing Artifacts/);
  assert.match(markdown, /output:scrape\.csv \(scrape\.csv\)/);
  assert.match(markdown, /--open-only/);
  assert.match(markdown, /objective-completion-audit/);
  const compact = formatObjectiveHandoffCompact(handoff);
  assert.match(compact, /^complete: no$/m);
  assert.match(compact, /^primary: primary-action$/m);
  assert.match(compact, /^human_action: run-login-capture-wait$/m);
  assert.match(compact, /^automation_blocker: operator-login-required$/m);
  assert.match(compact, /^capture_blocked: yes$/m);
  assert.match(compact, /^missing_artifact_count: 4$/m);
  assert.match(compact, /^missing_artifacts: auth-check,output:observe\.json,output:scrape\.csv,benchmark$/m);
  assert.match(compact, /^missing_output_files: observe\.json,scrape\.csv$/m);
  assert.match(compact, /^next_artifact_action: wait-auth-then-capture-proof$/m);
  assert.match(compact, /^next_artifact_blocker: operator-login-required$/m);
  assert.match(compact, /^artifact_command_covers: auth-check,observe,inspect,scrape,benchmark,target-proof$/m);
  assert.match(compact, /^secret_values_read: no$/m);
  assert.match(markdown, /proof-gate-watch/);
  assert.match(compact, /^proof_gate_watch_command: 'node' 'src\/cli\.mjs' 'proof-gate-watch'/m);
  assert.match(compact, /^manual_candidates: 1$/m);
  assert.match(compact, /^manual_1_command: 'node' 'src\/cli\.mjs' 'target-login-capture'/m);
});

test('objective handoff can write secret-free json under runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-handoff-'));
  const handoff = await buildObjectiveHandoff({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    audit: auditFixture(),
    write: true,
    out: 'operator/objective-handoff.json'
  });

  assert.equal(handoff.outputPath, path.join(rootDir, 'runs/operator/objective-handoff.json'));
  const written = JSON.parse(fs.readFileSync(handoff.outputPath, 'utf8'));
  assert.equal(written.status, 'action-required');
  assert.equal(written.missingArtifacts.length, 4);
  assert.equal(written.commands[4].id, 'completion-audit');
});

test('objective handoff prefers auth-first handoff resume for saved handoff state', async () => {
  const handoff = await buildObjectiveHandoff({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-28T00:00:00.000Z',
    audit: {
      ...auditFixture(),
      nextAction: {
        id: 'target-handoff-resume',
        label: 'Check auth state, then capture only after login is proved',
        needsOperatorInput: true,
        command: {
          shell: "'node' 'src/cli.mjs' 'target-handoff-resume' '/tmp/sba/runs/target-packs/github' '--handoff' 'operator-handoff.json' '--run' '--out' 'handoff-resume-latest.json' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'target-handoff-resume', '/tmp/sba/runs/target-packs/github', '--handoff', 'operator-handoff.json', '--run', '--out', 'handoff-resume-latest.json', '--format', 'compact']
        },
        operatorGuidance: {
          humanAction: 'complete-login-in-open-dedicated-browser',
          automationBlocker: 'auth-check-not-ok',
          captureBlocked: true
        },
        manualCommands: [
          "'node' 'src/cli.mjs' 'target-login-capture' 'runs/target-packs/github' '--real-external' '--handoff-out' 'operator-handoff.json' '--wait-auth-status-out' 'wait-auth-status.json' '--format' 'markdown'"
        ],
        manualCommandCandidates: [
          {
            id: 'login-capture-wait',
            label: 'Open login browser, wait for auth-check, then capture proof',
            command: {
              shell: "'node' 'src/cli.mjs' 'target-handoff-resume-watch' '/tmp/sba/runs/target-packs/github' '--handoff' 'operator-handoff.json' '--run' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--format' 'compact'",
              args: ['node', 'src/cli.mjs', 'target-handoff-resume-watch', '/tmp/sba/runs/target-packs/github', '--handoff', 'operator-handoff.json', '--run', '--monitor-timeout-ms', '10000', '--monitor-interval-ms', '1000', '--format', 'compact']
            }
          }
        ]
      }
    },
    monitorTimeoutMs: 10000,
    monitorIntervalMs: 1000
  });

  assert.deepEqual(handoff.commands.map((item) => item.id), ['primary-action', 'objective-status', 'proof-gate-watch', 'manual-candidate-login-capture-wait', 'completion-audit', 'objective-next']);
  assert.match(handoff.commands[0].shell, /target-handoff-resume/);
  assert.match(handoff.commands[0].shell, /'runs\/target-packs\/github'/);
  assert.doesNotMatch(handoff.commands[0].shell, /\/tmp\/sba\/runs\/target-packs\/github/);
  assert.match(handoff.commands[0].shell, /handoff-resume-latest\.json/);
  assert.match(handoff.commands[1].shell, /objective-status/);
  assert.match(handoff.commands[2].shell, /proof-gate-watch/);
  assert.match(handoff.commands[2].shell, /'--timeout-ms' '10000'/);
  assert.match(handoff.commands[2].shell, /'--interval-ms' '1000'/);
  assert.match(handoff.commands[3].shell, /target-handoff-resume-watch/);
  assert.match(handoff.commands[3].shell, /'--monitor-timeout-ms' '10000'/);
  assert.match(handoff.commands[3].shell, /'--monitor-interval-ms' '1000'/);
  assert.match(handoff.instructions.join('\n'), /runs proof capture only after login is proved/);
  assert.doesNotMatch(formatObjectiveHandoffMarkdown(handoff), /operator-ready-resume/);
  assert.match(formatObjectiveHandoffMarkdown(handoff), /Human action: complete-login-in-open-dedicated-browser/);
  assert.match(formatObjectiveHandoffMarkdown(handoff), /manual-candidate-login-capture-wait/);
  assert.match(formatObjectiveHandoffMarkdown(handoff), /'objective-next' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/);
  const compact = formatObjectiveHandoffCompact(handoff);
  assert.match(compact, /^human_action: complete-login-in-open-dedicated-browser$/m);
  assert.match(compact, /^automation_blocker: auth-check-not-ok$/m);
  assert.match(compact, /^capture_blocked: yes$/m);
  assert.match(compact, /^proof_gate_watch_command: 'node' 'src\/cli\.mjs' 'proof-gate-watch'.*'--timeout-ms' '10000'.*'--interval-ms' '1000'/m);
  assert.match(compact, /^manual_candidates: login-capture-wait$/m);
  assert.match(compact, /^manual_login_capture_wait_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume-watch'.*'--monitor-timeout-ms' '10000'.*'--monitor-interval-ms' '1000'/m);
  assert.doesNotMatch(compact, /\/tmp\/sba\/runs\/target-packs\/github/);
  assert.doesNotMatch(formatObjectiveHandoffMarkdown(handoff), /\/tmp\/sba\/runs\/target-packs\/github/);
});

test('objective handoff rejects parent-relative output paths', async () => {
  await assert.rejects(
    () => buildObjectiveHandoff({
      rootDir: '/tmp/sba',
      audit: auditFixture(),
      write: true,
      out: '../bad.json'
    }),
    /invalid handoff output path/
  );
});
