import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildObjectiveResume, formatObjectiveResumeCompact, formatObjectiveResumeMarkdown } from '../src/objective-resume.mjs';

function nextFixture(overrides = {}) {
  return {
    rootDir: '/tmp/sba',
    complete: false,
    primaryAction: {
      id: 'target-login',
      status: 'ready',
      label: 'Open login',
      writesLocalState: true,
      needsOperatorInput: true,
      operatorGuidance: {
        humanAction: 'run-login-capture-wait',
        automationBlocker: 'operator-login-required',
        captureBlocked: true
      },
      nextArtifactAction: 'wait-auth-then-capture-proof',
      nextArtifactBlocker: 'operator-login-required',
      artifactCommandCovers: ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof'],
      command: {
        args: ['node', 'src/cli.mjs', 'target-login', 'runs/target-packs/github'],
        shell: "'node' 'src/cli.mjs' 'target-login' 'runs/target-packs/github'"
      },
      manualCommandCandidates: [
        {
          id: 'open-only',
          label: 'Open login browser only',
          command: {
            args: ['node', 'src/cli.mjs', 'target-login-capture', 'runs/target-packs/github', '--open-only'],
            shell: "'node' 'src/cli.mjs' 'target-login-capture' 'runs/target-packs/github' '--open-only'"
          }
        }
      ],
      blockers: []
    },
    ...overrides
  };
}

test('objective resume plans the current primary action without running', async () => {
  const resume = await buildObjectiveResume({
    generatedAt: '2026-05-28T00:00:00.000Z',
    next: nextFixture()
  });

  assert.equal(resume.status, 'planned');
  assert.equal(resume.run, false);
  assert.equal(resume.readyToRun, true);
  assert.equal(resume.operatorOkRequired, false);
  assert.equal(resume.operatorOkAccepted, false);
  assert.equal(resume.plannedCommandOpensBrowser, true);
  assert.equal(resume.plannedCommandStartsCapture, false);
  assert.equal(resume.opensBrowserNow, false);
  assert.equal(resume.startsCaptureNow, false);
  assert.equal(resume.action.id, 'target-login');
  assert.equal(resume.result, null);
  assert.match(formatObjectiveResumeMarkdown(resume), /Objective Resume/);
  assert.match(formatObjectiveResumeMarkdown(resume), /target-login/);
  assert.match(formatObjectiveResumeCompact(resume), /^status: planned$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^operator_ok_required: no$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^planned_command_opens_browser: yes$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^opens_browser_now: no$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^action: target-login$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^human_action: run-login-capture-wait$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^automation_blocker: operator-login-required$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^capture_blocked: yes$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^next_artifact_action: wait-auth-then-capture-proof$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^next_artifact_blocker: operator-login-required$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^artifact_command_covers: auth-check,observe,inspect,scrape,benchmark,target-proof$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^command: 'node' 'src\/cli\.mjs' 'target-login'/m);
  assert.match(formatObjectiveResumeMarkdown(resume), /Human action: run-login-capture-wait/);
  assert.match(formatObjectiveResumeMarkdown(resume), /Automation blocker: operator-login-required/);
  assert.match(formatObjectiveResumeMarkdown(resume), /Capture blocked: yes/);
  assert.match(formatObjectiveResumeMarkdown(resume), /Next artifact action: wait-auth-then-capture-proof/);
});

test('objective resume blocks browser-opening run without operator OK', async () => {
  const calls = [];
  const resume = await buildObjectiveResume({
    run: true,
    next: nextFixture(),
    runner: (args) => {
      calls.push(args.join(' '));
      return { ok: true, status: 0, stdout: '', stderr: '' };
    }
  });

  assert.equal(resume.status, 'blocked');
  assert.equal(resume.readyToRun, false);
  assert.equal(resume.operatorOkRequired, true);
  assert.equal(resume.operatorOkAccepted, false);
  assert.equal(resume.plannedCommandOpensBrowser, true);
  assert.equal(resume.opensBrowserNow, false);
  assert.deepEqual(calls, []);
  assert.match(resume.blockers.join('\n'), /--operator-ok OK/);
  assert.match(formatObjectiveResumeCompact(resume), /^operator_ok_required: yes$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^operator_ok_accepted: no$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^opens_browser_now: no$/m);
});

test('objective resume runs the selected structured command with an injectable runner', async () => {
  const calls = [];
  const resume = await buildObjectiveResume({
    run: true,
    operatorOk: 'OK',
    skipNextAfterRun: true,
    next: nextFixture(),
    runner: (args) => {
      calls.push(args.join(' '));
      return {
        ok: true,
        status: 0,
        stdout: JSON.stringify({
          opened: true,
          handoff: {
            instructions: ['Complete login in the opened dedicated Chrome profile.'],
            commands: [
              {
                id: 'post-login-capture',
                title: 'Capture proof',
                shell: "'node' 'src/cli.mjs' 'target-proof-capture' 'runs/target-packs/github' '--real-external' '--run' '--format' 'markdown'"
              }
            ]
          }
        }),
        stderr: ''
      };
    }
  });

  assert.equal(resume.status, 'completed');
  assert.equal(resume.operatorOkRequired, true);
  assert.equal(resume.operatorOkAccepted, true);
  assert.equal(resume.opensBrowserNow, true);
  assert.equal(resume.result.ok, true);
  assert.equal(resume.result.handoff.commands[0].id, 'post-login-capture');
  assert.match(formatObjectiveResumeMarkdown(resume), /Operator Handoff/);
  assert.match(formatObjectiveResumeMarkdown(resume), /target-proof-capture/);
  assert.match(formatObjectiveResumeCompact(resume), /^result_ok: yes$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^exit: 0$/m);
  assert.deepEqual(calls, ['node src/cli.mjs target-login runs/target-packs/github']);
});

test('objective resume can select and run a structured manual command candidate', async () => {
  const calls = [];
  const resume = await buildObjectiveResume({
    run: true,
    operatorOk: 'OK',
    manualCandidate: 'open-only',
    skipNextAfterRun: true,
    next: nextFixture(),
    runner: (args) => {
      calls.push(args.join(' '));
      return {
        ok: true,
        status: 0,
        stdout: JSON.stringify({
          status: 'login-opened',
          handoff: {
            instructions: ['Complete login in the opened dedicated Chrome profile.'],
            commands: []
          }
        }),
        stderr: ''
      };
    }
  });

  assert.equal(resume.status, 'completed');
  assert.equal(resume.operatorOkRequired, true);
  assert.equal(resume.operatorOkAccepted, true);
  assert.equal(resume.selectedManualCandidate.id, 'open-only');
  assert.equal(resume.action.id, 'target-login:open-only');
  assert.deepEqual(calls, ['node src/cli.mjs target-login-capture runs/target-packs/github --open-only']);
  const markdown = formatObjectiveResumeMarkdown(resume);
  assert.match(markdown, /Manual candidate: open-only/);
  assert.match(markdown, /--open-only/);
});

test('objective resume can select the login-capture-wait manual candidate for saved handoff state', async () => {
  const calls = [];
  const resume = await buildObjectiveResume({
    run: true,
    operatorOk: 'OK',
    manualCandidate: 'login-capture-wait',
    skipNextAfterRun: true,
    next: nextFixture({
      primaryAction: {
        id: 'target-handoff-capture',
        status: 'ready',
        label: 'Complete login, then run saved handoff capture',
        writesLocalState: true,
        needsOperatorInput: true,
        command: {
          args: [
            'node',
            'src/cli.mjs',
            'target-handoff-run',
            'runs/target-packs/github',
            '--handoff',
            'operator-handoff.json',
            '--command',
            'post-login-capture',
            '--run'
          ],
          shell: "'node' 'src/cli.mjs' 'target-handoff-run' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--command' 'post-login-capture' '--run'"
        },
        manualCommandCandidates: [
          {
            id: 'login-capture-wait',
            label: 'Open login browser, wait for auth-check, then capture proof',
            command: {
              args: [
                'node',
                'src/cli.mjs',
                'target-login-capture',
                'runs/target-packs/github',
                '--real-external',
                '--handoff-out',
                'operator-handoff.json',
                '--wait-auth-status-out',
                'wait-auth-status.json',
                '--format',
                'markdown'
              ],
              shell: "'node' 'src/cli.mjs' 'target-login-capture' 'runs/target-packs/github' '--real-external' '--handoff-out' 'operator-handoff.json' '--wait-auth-status-out' 'wait-auth-status.json' '--format' 'markdown'"
            }
          }
        ],
        blockers: []
      }
    }),
    runner: (args) => {
      calls.push(args.join(' '));
      return {
        ok: true,
        status: 0,
        stdout: JSON.stringify({
          status: 'completed',
          handoff: {
            instructions: ['Capture completed after login.'],
            commands: []
          }
        }),
        stderr: ''
      };
    }
  });

  assert.equal(resume.status, 'completed');
  assert.equal(resume.operatorOkRequired, true);
  assert.equal(resume.operatorOkAccepted, true);
  assert.equal(resume.startsCaptureNow, true);
  assert.equal(resume.selectedManualCandidate.id, 'login-capture-wait');
  assert.equal(resume.action.id, 'target-handoff-capture:login-capture-wait');
  assert.deepEqual(calls, ['node src/cli.mjs target-login-capture runs/target-packs/github --real-external --handoff-out operator-handoff.json --wait-auth-status-out wait-auth-status.json --format markdown']);
  assert.match(formatObjectiveResumeMarkdown(resume), /login-capture-wait/);
});

test('objective resume can shorten login-capture wait settings without killing the runner early', async () => {
  const calls = [];
  const runnerOptions = [];
  const resume = await buildObjectiveResume({
    run: true,
    operatorOk: 'OK',
    manualCandidate: 'login-capture-wait',
    waitAuthTimeoutMs: 10000,
    waitAuthIntervalMs: 1000,
    skipNextAfterRun: true,
    next: nextFixture({
      primaryAction: {
        id: 'target-handoff-capture',
        status: 'ready',
        label: 'Complete login, then run saved handoff capture',
        writesLocalState: true,
        needsOperatorInput: true,
        command: {
          args: [
            'node',
            'src/cli.mjs',
            'target-handoff-run',
            'runs/target-packs/github',
            '--handoff',
            'operator-handoff.json',
            '--command',
            'post-login-capture',
            '--run'
          ],
          shell: "'node' 'src/cli.mjs' 'target-handoff-run' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--command' 'post-login-capture' '--run'"
        },
        manualCommandCandidates: [
          {
            id: 'login-capture-wait',
            label: 'Open login browser, wait for auth-check, then capture proof',
            command: {
              args: [
                'node',
                'src/cli.mjs',
                'target-login-capture',
                'runs/target-packs/github',
                '--real-external',
                '--handoff-out',
                'operator-handoff.json',
                '--wait-auth-status-out',
                'wait-auth-status.json',
                '--format',
                'markdown'
              ],
              shell: "'node' 'src/cli.mjs' 'target-login-capture' 'runs/target-packs/github' '--real-external' '--handoff-out' 'operator-handoff.json' '--wait-auth-status-out' 'wait-auth-status.json' '--format' 'markdown'"
            }
          }
        ],
        blockers: []
      }
    }),
    runner: (args, options) => {
      calls.push(args.join(' '));
      runnerOptions.push(options);
      return {
        ok: true,
        status: 0,
        stdout: JSON.stringify({ status: 'completed' }),
        stderr: ''
      };
    }
  });

  assert.equal(resume.status, 'completed');
  assert.match(calls[0], /--wait-auth-timeout-ms 10000/);
  assert.match(calls[0], /--wait-auth-interval-ms 1000/);
  assert.match(calls[0], /--handoff-out operator-handoff-probe\.json/);
  assert.doesNotMatch(calls[0], /--handoff-out operator-handoff\.json/);
  assert.match(calls[0], /--wait-auth-status-out wait-auth-status-probe\.json/);
  assert.doesNotMatch(calls[0], /--wait-auth-status-out wait-auth-status\.json/);
  assert.match(resume.selectedManualCandidate.command.shell, /--wait-auth-timeout-ms' '10000/);
  assert.match(resume.selectedManualCandidate.command.shell, /operator-handoff-probe\.json/);
  assert.match(resume.selectedManualCandidate.command.shell, /wait-auth-status-probe\.json/);
  assert.equal(runnerOptions[0].timeoutMs, 70000);
});

test('objective resume writes short wait probes to a separate default resume file', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-resume-'));
  const resume = await buildObjectiveResume({
    rootDir,
    run: true,
    operatorOk: 'OK',
    write: true,
    manualCandidate: 'open-only',
    waitAuthTimeoutMs: 10000,
    skipNextAfterRun: true,
    next: nextFixture({ rootDir }),
    runner: () => ({
      ok: true,
      status: 0,
      stdout: JSON.stringify({ status: 'login-opened' }),
      stderr: ''
    })
  });

  const probePath = path.join(rootDir, 'runs/operator/objective-resume-probe-latest.json');
  const normalPath = path.join(rootDir, 'runs/operator/objective-resume-latest.json');
  assert.equal(resume.outputPath, probePath);
  assert.equal(fs.existsSync(probePath), true);
  assert.equal(fs.existsSync(normalPath), false);
});

test('objective resume treats a timed-out child capture as failed even with zero exit', async () => {
  const resume = await buildObjectiveResume({
    run: true,
    operatorOk: 'OK',
    manualCandidate: 'open-only',
    skipNextAfterRun: true,
    next: nextFixture(),
    runner: () => ({
      ok: true,
      status: 0,
      stdout: '# Secure Browser Agent Target Login Capture\n\nStatus: timed-out\n',
      stderr: ''
    })
  });

  assert.equal(resume.status, 'failed');
  assert.equal(resume.result.ok, false);
  assert.equal(resume.result.childStatus, 'timed-out');
  assert.match(formatObjectiveResumeMarkdown(resume), /Child status: timed-out/);
});

test('objective resume can run auth-first target handoff resume without operator-ready flag', async () => {
  const calls = [];
  const resume = await buildObjectiveResume({
    run: true,
    skipNextAfterRun: true,
    next: nextFixture({
      primaryAction: {
        id: 'target-handoff-resume',
        status: 'ready',
        label: 'Check auth state, then capture only after login is proved',
        writesLocalState: true,
        needsOperatorInput: true,
        command: {
          args: [
            'node',
            'src/cli.mjs',
            'target-handoff-resume',
            'runs/target-packs/github',
            '--handoff',
            'operator-handoff.json',
            '--run',
            '--out',
            'handoff-resume-latest.json',
            '--format',
            'compact'
          ],
          shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--run' '--out' 'handoff-resume-latest.json' '--format' 'compact'"
        },
        manualCommandCandidates: [],
        blockers: []
      }
    }),
    runner: (args) => {
      calls.push(args.join(' '));
      return {
        ok: true,
        status: 0,
        stdout: 'status: waiting-for-login\nrun: yes\n',
        stderr: ''
      };
    }
  });

  assert.equal(resume.status, 'failed');
  assert.equal(resume.readyToRun, true);
  assert.equal(resume.result.ok, false);
  assert.equal(resume.result.childStatus, 'waiting-for-login');
  assert.deepEqual(calls, ['node src/cli.mjs target-handoff-resume runs/target-packs/github --handoff operator-handoff.json --run --out handoff-resume-latest.json --format compact']);
  assert.match(formatObjectiveResumeCompact(resume), /^child_status: waiting-for-login$/m);
});

test('objective resume blocks when requested manual candidate is missing', async () => {
  const resume = await buildObjectiveResume({
    run: true,
    manualCandidate: 'missing',
    next: nextFixture()
  });

  assert.equal(resume.status, 'blocked');
  assert.match(resume.blockers.join('\n'), /Manual command candidate not found: missing/);
});

test('objective resume blocks saved handoff capture until operator login is complete', async () => {
  const calls = [];
  const resume = await buildObjectiveResume({
    run: true,
    next: nextFixture({
      primaryAction: {
        id: 'target-handoff-capture',
        status: 'ready',
        label: 'Complete login, then run saved handoff capture',
        writesLocalState: true,
        needsOperatorInput: true,
        command: {
          args: [
            'node',
            'src/cli.mjs',
            'target-handoff-run',
            'runs/target-packs/github',
            '--handoff',
            'operator-handoff.json',
            '--command',
            'post-login-capture',
            '--run',
            '--out',
            'handoff-run-latest.json'
          ],
          shell: "'node' 'src/cli.mjs' 'target-handoff-run' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--command' 'post-login-capture' '--run' '--out' 'handoff-run-latest.json'"
        },
        blockers: ['Target auth-check proof file is not present or says the page still looks logged out.']
      }
    }),
    runner: (args) => {
      calls.push(args.join(' '));
      return { ok: true, status: 0, stdout: '', stderr: '' };
    }
  });

  assert.equal(resume.status, 'blocked');
  assert.equal(resume.readyToRun, false);
  assert.deepEqual(calls, []);
  assert.match(resume.blockers.join('\n'), /--operator-ready/);
  assert.match(formatObjectiveResumeMarkdown(resume), /Needs operator input: yes/);
});

test('objective resume runs saved handoff capture after explicit operator-ready assertion', async () => {
  const calls = [];
  const resume = await buildObjectiveResume({
    run: true,
    operatorReady: true,
    operatorOk: 'OK',
    skipNextAfterRun: true,
    operatorReadyPreflight: async () => ({
      ok: true,
      kind: 'target-auth-check',
      targetDir: 'runs/target-packs/github',
      cdpPort: '45678',
      finalUrl: 'https://github.com/dashboard',
      loginLike: false
    }),
    next: nextFixture({
      primaryAction: {
        id: 'target-handoff-capture',
        status: 'ready',
        label: 'Complete login, then run saved handoff capture',
        writesLocalState: true,
        needsOperatorInput: true,
        command: {
          args: [
            'node',
            'src/cli.mjs',
            'target-handoff-run',
            'runs/target-packs/github',
            '--handoff',
            'operator-handoff.json',
            '--command',
            'post-login-capture',
            '--run',
            '--out',
            'handoff-run-latest.json'
          ],
          shell: "'node' 'src/cli.mjs' 'target-handoff-run' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--command' 'post-login-capture' '--run' '--out' 'handoff-run-latest.json'"
        },
        blockers: []
      }
    }),
    runner: (args) => {
      calls.push(args.join(' '));
      return { ok: true, status: 0, stdout: '', stderr: '' };
    }
  });

  assert.equal(resume.status, 'completed');
  assert.equal(resume.operatorReady, true);
  assert.equal(resume.operatorOkRequired, true);
  assert.equal(resume.operatorOkAccepted, true);
  assert.equal(resume.operatorReadyPreflight.ok, true);
  assert.deepEqual(calls, ['node src/cli.mjs target-handoff-run runs/target-packs/github --handoff operator-handoff.json --command post-login-capture --run --out handoff-run-latest.json']);
  assert.match(formatObjectiveResumeMarkdown(resume), /Operator ready: yes/);
  assert.match(formatObjectiveResumeMarkdown(resume), /Operator Ready Preflight/);
});

test('objective resume blocks operator-ready handoff capture when auth preflight still sees login', async () => {
  const calls = [];
  const resume = await buildObjectiveResume({
    run: true,
    operatorReady: true,
    operatorOk: 'OK',
    next: nextFixture({
      primaryAction: {
        id: 'target-handoff-capture',
        status: 'ready',
        label: 'Complete login, then run saved handoff capture',
        writesLocalState: true,
        needsOperatorInput: true,
        command: {
          args: [
            'node',
            'src/cli.mjs',
            'target-handoff-run',
            'runs/target-packs/github',
            '--handoff',
            'operator-handoff.json',
            '--command',
            'post-login-capture',
            '--run',
            '--out',
            'handoff-run-latest.json'
          ],
          shell: "'node' 'src/cli.mjs' 'target-handoff-run' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--command' 'post-login-capture' '--run' '--out' 'handoff-run-latest.json'"
        },
        blockers: []
      }
    }),
    operatorReadyPreflight: async () => ({
      ok: false,
      kind: 'target-auth-check',
      targetDir: 'runs/target-packs/github',
      cdpPort: '45678',
      finalUrl: 'https://github.com/login',
      loginLike: true,
      blocker: 'Operator-ready preflight failed: auth-check still sees login.'
    }),
    runner: (args) => {
      calls.push(args.join(' '));
      return { ok: true, status: 0, stdout: '', stderr: '' };
    }
  });

  assert.equal(resume.status, 'blocked');
  assert.equal(resume.readyToRun, false);
  assert.equal(resume.operatorReadyPreflight.ok, false);
  assert.deepEqual(calls, []);
  assert.match(resume.blockers.join('\n'), /auth-check still sees login/);
  assert.match(formatObjectiveResumeMarkdown(resume), /Operator Ready Preflight/);
  assert.match(formatObjectiveResumeCompact(resume), /^preflight_ok: no$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^final_url: https:\/\/github\.com\/login$/m);
  assert.match(formatObjectiveResumeCompact(resume), /^detail: Operator-ready preflight failed: auth-check still sees login\.$/m);
});

test('objective resume blocks when the primary action has no structured args', async () => {
  const resume = await buildObjectiveResume({
    run: true,
    next: nextFixture({
      primaryAction: {
        id: 'manual',
        status: 'ready',
        label: 'Manual shell only',
        command: { shell: 'echo manual' }
      }
    })
  });

  assert.equal(resume.status, 'blocked');
  assert.equal(resume.readyToRun, false);
  assert.match(resume.blockers.join('\n'), /structured command/);
});

test('objective resume can write blocked state under runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-resume-'));
  const resume = await buildObjectiveResume({
    rootDir,
    run: true,
    write: true,
    out: 'operator/objective-resume-latest.json',
    next: nextFixture({
      rootDir,
      primaryAction: {
        id: 'target-handoff-capture',
        status: 'ready',
        label: 'Complete login, then run saved handoff capture',
        writesLocalState: true,
        needsOperatorInput: true,
        command: {
          args: [
            'node',
            'src/cli.mjs',
            'target-handoff-run',
            'runs/target-packs/github',
            '--handoff',
            'operator-handoff.json',
            '--command',
            'post-login-capture',
            '--run',
            '--out',
            'handoff-run-latest.json'
          ],
          shell: "'node' 'src/cli.mjs' 'target-handoff-run' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--command' 'post-login-capture' '--run' '--out' 'handoff-run-latest.json'"
        },
        blockers: ['Target auth-check proof file is not present or says the page still looks logged out.']
      }
    })
  });

  const expectedPath = path.join(rootDir, 'runs/operator/objective-resume-latest.json');
  assert.equal(resume.status, 'blocked');
  assert.equal(resume.outputPath, expectedPath);
  const written = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
  assert.equal(written.status, 'blocked');
  assert.equal(written.outputPath, expectedPath);
  assert.match(formatObjectiveResumeMarkdown(resume), /Written Resume/);
});

test('objective resume rejects output paths outside runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-resume-'));
  await assert.rejects(
    () => buildObjectiveResume({
      rootDir,
      write: true,
      out: '../bad.json',
      next: nextFixture({ rootDir })
    }),
    /invalid resume output path/
  );
});
