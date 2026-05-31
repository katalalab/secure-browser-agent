import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTargetLoginCapture, formatTargetLoginCaptureMarkdown } from '../src/target-login-capture.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTargetPack() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-login-capture-'));
  const dir = path.join(root, 'github');
  writeJson(path.join(dir, 'target.json'), {
    schemaVersion: 1,
    target: 'github',
    origins: ['https://github.com'],
    loginUrl: 'https://github.com/login',
    pageUrl: 'https://github.com/dashboard',
    profile: 'github'
  });
  writeJson(path.join(dir, 'policy.json'), {
    allowedOrigins: ['https://github.com'],
    defaultProfile: 'github',
    defaultEngine: 'chrome',
    allowedEngines: ['chrome'],
    authenticatedEngines: ['chrome'],
    outputDir: path.join(dir, 'outputs'),
    profileDir: path.join(dir, 'profiles'),
    redactKeys: ['authorization', 'cookie', 'password', 'token'],
    maxEvalBytes: 12000
  });
  return dir;
}

test('target login capture dry-run builds one-shot wait-auth capture command', async () => {
  const targetDir = writeTargetPack();
  const result = await buildTargetLoginCapture(targetDir, {
    realExternal: true,
    dryRun: true,
    handoffOut: 'operator-handoff.json',
    waitAuthTimeoutMs: 120000,
    generatedAt: '2026-05-28T00:00:00.000Z'
  });

  assert.equal(result.status, 'planned');
  assert.equal(result.dryRun, true);
  assert.equal(result.login, null);
  assert.equal(result.capture, null);
  assert.deepEqual(result.captureCommand.args.slice(0, 4), ['node', 'src/cli.mjs', 'target-proof-capture', targetDir]);
  assert.match(result.captureCommand.shell, /--wait-auth/);
  assert.match(result.captureCommand.shell, /--wait-auth-timeout-ms/);
  assert.match(result.captureCommand.shell, /--wait-auth-status-out/);
  assert.match(result.captureCommand.shell, /wait-auth-status\.json/);
  assert.match(result.captureCommand.shell, /--completion-audit/);
  assert.equal(result.handoff.commands[0].id, 'post-login-capture');
  assert.match(result.handoff.commands[0].shell, /target-proof-capture/);
  assert.deepEqual(result.handoff.commands.map((item) => item.id), [
    'post-login-capture',
    'auth-check-status',
    'control-status',
    'secret-run-plan',
    'proof-plan-status',
    'readiness-audit',
    'objective-completion-audit',
    'objective-next'
  ]);
  assert.match(result.handoff.instructions.join('\n'), /Do not paste credentials/);
  assert.match(result.handoffPath, /outputs\/operator-handoff\.json$/);
  const written = JSON.parse(fs.readFileSync(result.handoffPath, 'utf8'));
  assert.equal(written.target, 'github');
  assert.equal(written.handoff.commands[0].id, 'post-login-capture');
  assert.deepEqual(written.handoff.commands[0].args.slice(0, 4), ['node', 'src/cli.mjs', 'target-proof-capture', targetDir]);
  assert.ok(written.handoff.commands[0].args.includes('--completion-audit'));
  assert.equal(written.handoff.commands.at(-1).id, 'objective-next');
  assert.deepEqual(written.handoff.commands.at(-1).args, ['node', 'src/cli.mjs', 'objective-next', '--format', 'markdown']);
  assert.ok(written.handoff.commands.some((item) => item.id === 'objective-completion-audit'));
  assert.ok(written.handoff.commands.some((item) => item.id === 'auth-check-status'));
  assert.ok(written.handoff.commands.some((item) => item.id === 'control-status'));
  assert.ok(written.handoff.commands.some((item) => item.id === 'secret-run-plan'));
  const markdown = formatTargetLoginCaptureMarkdown(result);
  assert.match(markdown, /Target Login Capture/);
  assert.match(markdown, /Operator Handoff/);
  assert.match(markdown, /proof-plan-status/);
  assert.match(markdown, /Written Handoff/);
});

test('target login capture can write a markdown operator handoff under the output dir', async () => {
  const targetDir = writeTargetPack();
  const result = await buildTargetLoginCapture(targetDir, {
    realExternal: true,
    dryRun: true,
    handoffOut: 'operator-handoff.md',
    generatedAt: '2026-05-28T00:00:00.000Z'
  });

  assert.match(result.handoffPath, /outputs\/operator-handoff\.md$/);
  const text = fs.readFileSync(result.handoffPath, 'utf8');
  assert.match(text, /Operator Handoff/);
  assert.match(text, /Do not paste credentials/);
  assert.match(text, /readiness-audit/);
  assert.match(text, /objective-completion-audit/);
  assert.match(text, /auth-check-status/);
  assert.match(text, /secret-run-plan/);
});

test('target login capture opens the login profile and passes its CDP port to proof capture', async () => {
  const targetDir = writeTargetPack();
  const calls = {
    opener: [],
    capture: []
  };
  const result = await buildTargetLoginCapture(targetDir, {
    realExternal: true,
    waitAuthIntervalMs: 10,
    generatedAt: '2026-05-28T00:00:00.000Z',
    opener: async (url, profileDir, options) => {
      calls.opener.push({ url, profileDir, options });
      return {
        ok: true,
        url,
        profileDir,
        port: 45678
      };
    },
    captureBuilder: async (dir, options) => {
      calls.capture.push({ dir, options });
      return {
        status: 'completed',
        target: 'github',
        profile: 'github',
        realExternal: true,
        run: true,
        readyToRun: true,
        safeMode: true,
        destructiveActionsIncluded: false,
        waitAuth: { enabled: true, status: 'authenticated', attempts: [] },
        blockers: [],
        steps: []
      };
    }
  });

  assert.equal(result.status, 'completed');
  assert.equal(calls.opener.length, 1);
  assert.equal(calls.opener[0].url, 'https://github.com/login');
  assert.equal(calls.opener[0].options.headed, true);
  assert.match(calls.opener[0].profileDir, /profiles\/github$/);
  assert.equal(calls.capture.length, 1);
  assert.equal(calls.capture[0].dir, targetDir);
  assert.equal(calls.capture[0].options.authCheckPort, 45678);
  assert.equal(calls.capture[0].options.waitAuth, true);
  assert.equal(calls.capture[0].options.waitAuthStatusOut, 'wait-auth-status.json');
  assert.equal(calls.capture[0].options.run, true);
  assert.equal(calls.capture[0].options.realExternal, true);
  assert.equal(result.handoff.commands[0].id, 'post-login-capture');
  assert.ok(result.handoff.commands.find((item) => item.id === 'auth-check-status').args.includes('45678'));
});

test('target login capture does not overwrite an existing handoff when Chrome open fails', async () => {
  const targetDir = writeTargetPack();
  const existingHandoff = path.join(targetDir, 'outputs/operator-handoff.json');
  writeJson(existingHandoff, {
    schemaVersion: 1,
    target: 'github',
    handoff: {
      commands: [
        {
          id: 'post-login-capture',
          args: ['node', 'src/cli.mjs', 'target-proof-capture', targetDir, '--auth-check-port', '45678']
        }
      ]
    }
  });

  await assert.rejects(
    () => buildTargetLoginCapture(targetDir, {
      realExternal: true,
      handoffOut: 'operator-handoff.json',
      waitAuthTimeoutMs: 5000,
      opener: async () => {
        throw new Error('Chrome exited early: 0');
      }
    }),
    /Chrome exited early/
  );

  const written = JSON.parse(fs.readFileSync(existingHandoff, 'utf8'));
  assert.equal(written.handoff.commands[0].args.at(-1), '45678');
  assert.ok(written.handoff.commands[0].args.includes('--auth-check-port'));
});

test('target login capture open-only opens login browser and writes port-aware handoff without running capture', async () => {
  const targetDir = writeTargetPack();
  const calls = {
    opener: [],
    capture: []
  };
  const result = await buildTargetLoginCapture(targetDir, {
    realExternal: true,
    openOnly: true,
    handoffOut: 'operator-handoff.json',
    waitAuthIntervalMs: 10,
    generatedAt: '2026-05-28T00:00:00.000Z',
    opener: async (url, profileDir, options) => {
      calls.opener.push({ url, profileDir, options });
      return {
        ok: true,
        url,
        profileDir,
        port: 45678
      };
    },
    captureBuilder: async (dir, options) => {
      calls.capture.push({ dir, options });
      return { status: 'should-not-run' };
    }
  });

  assert.equal(result.status, 'login-opened');
  assert.equal(result.openOnly, true);
  assert.equal(result.capture, null);
  assert.equal(calls.opener.length, 1);
  assert.equal(calls.capture.length, 0);
  assert.match(result.captureCommand.shell, /--auth-check-port/);
  assert.match(result.captureCommand.shell, /45678/);
  assert.match(result.handoffPath, /outputs\/operator-handoff\.json$/);
  const written = JSON.parse(fs.readFileSync(result.handoffPath, 'utf8'));
  assert.deepEqual(written.handoff.commands[0].args.slice(0, 4), ['node', 'src/cli.mjs', 'target-proof-capture', targetDir]);
  assert.match(written.handoff.commands[0].shell, /--auth-check-port/);
  assert.ok(written.handoff.commands[0].args.includes('--auth-check-port'));
  assert.ok(written.handoff.commands[0].args.includes('--completion-audit'));
  assert.match(written.handoff.commands[0].shell, /45678/);
  const authCheck = written.handoff.commands.find((item) => item.id === 'auth-check-status');
  assert.ok(authCheck.args.includes('--cdp-port'));
  assert.ok(authCheck.args.includes('45678'));
  const markdown = formatTargetLoginCaptureMarkdown(result);
  assert.match(markdown, /Open only: yes/);
  assert.match(markdown, /CDP port: 45678/);
});
