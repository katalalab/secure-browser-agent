import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy } from '../src/policy.mjs';
import { scaffoldTargetPack } from '../src/target-pack.mjs';
import { buildTargetAuthCheck, buildTargetAuthWatch, formatTargetAuthCheckCompact, formatTargetAuthCheckMarkdown, formatTargetAuthWatchCompact } from '../src/target-auth-check.mjs';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeFixturePolicy(root) {
  const policyPath = path.join(root, 'config', 'policy.json');
  writeJson(policyPath, {
    allowedOrigins: ['https://accounts.vendor-service.com', 'https://app.vendor-service.com'],
    defaultProfile: 'default',
    defaultEngine: 'chrome',
    allowedEngines: ['chrome'],
    authenticatedEngines: ['chrome'],
    outputDir: 'runs',
    profileDir: 'profiles',
    redactKeys: ['authorization', 'cookie', 'password', 'token', 'secret'],
    maxEvalBytes: 12000
  });
  return policyPath;
}

function scaffold(root) {
  const policy = loadPolicy(writeFixturePolicy(root));
  return scaffoldTargetPack(policy, {
    name: 'vendor-service',
    origins: 'https://accounts.vendor-service.com,https://app.vendor-service.com',
    loginUrl: 'https://accounts.vendor-service.com/login',
    pageUrl: 'https://app.vendor-service.com/dashboard',
    force: true
  });
}

test('target auth check accepts same-origin non-login page without page text samples', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-auth-check-ok-'));
  try {
    const pack = scaffold(root);
    const report = await buildTargetAuthCheck(pack.dir, {
      observe: {
        url: 'https://app.vendor-service.com/dashboard',
        title: 'Dashboard',
        counts: { links: 3, controls: 1 },
        controls: [{ type: 'button', name: 'New' }],
        forms: [],
        textSample: 'this must not be written'
      },
      write: true,
      generatedAt: '2026-05-28T00:00:00.000Z'
    });

    assert.equal(report.ok, true);
    assert.equal(report.sameOrigin, true);
    assert.equal(report.loginLike, false);
    assert.equal(report.nextAction.id, 'capture');
    assert.match(report.nextAction.command.shell, /target-proof-capture/);
    assert.ok(report.proofPath.endsWith('proof/auth-check.json'));
    const written = JSON.parse(fs.readFileSync(report.proofPath, 'utf8'));
    assert.equal(JSON.stringify(written).includes('this must not be written'), false);
    const markdown = formatTargetAuthCheckMarkdown(report);
    assert.match(markdown, /OK: yes/);
    assert.match(markdown, /Page URL: \[redacted\]/);
    assert.match(markdown, /Final URL: \[redacted\]/);
    assert.match(markdown, /Title: \[redacted\]/);
    assert.doesNotMatch(markdown, /https:\/\/app\.vendor-service\.com\/dashboard/);
    assert.doesNotMatch(markdown, /Dashboard/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target auth check rejects login-like page signals', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-auth-check-login-'));
  try {
    const pack = scaffold(root);
    const report = await buildTargetAuthCheck(pack.dir, {
      observe: {
        url: 'https://accounts.vendor-service.com/login',
        title: 'Sign in',
        counts: { controls: 2 },
        controls: [{ type: 'password', name: 'Password' }],
        forms: []
      },
      generatedAt: '2026-05-28T00:00:00.000Z'
    });

    assert.equal(report.ok, false);
    assert.equal(report.loginLike, true);
    assert.equal(report.signals.onLoginUrl, true);
    assert.equal(report.signals.hasPassword, true);
    assert.equal(report.signals.hasSignInTitle, true);
    assert.equal(report.nextAction.id, 'login-capture');
    assert.match(report.nextAction.command.shell, /target-login-capture/);
    assert.match(report.nextAction.command.shell, /--real-external/);
    assert.match(report.nextAction.command.shell, /--wait-auth-status-out/);
    assert.match(report.nextAction.command.shell, /wait-auth-status\.json/);
    assert.match(report.nextAction.command.shell, /markdown/);
    const markdown = formatTargetAuthCheckMarkdown(report);
    assert.match(markdown, /OK: no/);
    assert.match(markdown, /Next Action/);
    assert.match(markdown, /Final URL: \[redacted\]/);
    assert.match(markdown, /Title: \[redacted\]/);
    assert.doesNotMatch(markdown, /https:\/\/accounts\.vendor-service\.com\/login/);
    assert.doesNotMatch(markdown, /Sign in/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target auth check prefers saved handoff resume when login-like page still has a handoff', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-auth-check-handoff-'));
  try {
    const pack = scaffold(root);
    const targetPolicy = loadPolicy(pack.policy);
    writeJson(path.join(targetPolicy.outputDir, 'operator-handoff.json'), {
      schemaVersion: 1,
      target: 'vendor-service',
      handoff: { commands: [] }
    });
    const report = await buildTargetAuthCheck(pack.dir, {
      observe: {
        url: 'https://accounts.vendor-service.com/login',
        title: 'Sign in',
        counts: { controls: 2 },
        controls: [{ type: 'password', name: 'Password' }],
        forms: []
      },
      generatedAt: '2026-05-28T00:00:00.000Z'
    });

    assert.equal(report.ok, false);
    assert.equal(report.loginLike, true);
    assert.equal(report.nextAction.id, 'handoff-resume');
    assert.match(report.nextAction.command.shell, /target-handoff-resume/);
    assert.match(report.nextAction.command.shell, /operator-handoff\.json/);
    assert.match(report.nextAction.command.shell, /--open-login/);
    assert.match(report.nextAction.command.shell, /--wait-auth/);
    assert.match(report.nextAction.command.shell, /compact/);
    assert.match(formatTargetAuthCheckMarkdown(report), /handoff-resume/);
    const compact = formatTargetAuthCheckCompact(report);
    assert.match(compact, /^ok: no$/m);
    assert.match(compact, /^login_like: yes$/m);
    assert.match(compact, /^final_url: \[redacted\]$/m);
    assert.match(compact, /^title: \[redacted\]$/m);
    assert.doesNotMatch(compact, /https:\/\/accounts\.vendor-service\.com\/login/);
    assert.doesNotMatch(compact, /Sign in/);
    assert.match(compact, /^next_action: handoff-resume$/m);
    assert.match(compact, /target-handoff-resume/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target auth check can resolve cdp port from an explicit handoff', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-auth-check-handoff-port-'));
  try {
    const pack = scaffold(root);
    const targetPolicy = loadPolicy(pack.policy);
    writeJson(path.join(targetPolicy.outputDir, 'operator-handoff.json'), {
      schemaVersion: 1,
      target: 'vendor-service',
      realExternal: true,
      handoff: {
        commands: [
          {
            id: 'post-login-capture',
            args: [
              'node',
              'src/cli.mjs',
              'target-proof-capture',
              pack.dir,
              '--real-external',
              '--auth-check-port',
              '59036',
              '--format',
              'markdown'
            ]
          }
        ]
      }
    });
    const report = await buildTargetAuthCheck(pack.dir, {
      handoff: 'operator-handoff.json',
      observe: {
        url: 'https://accounts.vendor-service.com/login',
        title: 'Sign in',
        counts: { controls: 2 },
        controls: [{ type: 'password', name: 'Password' }],
        forms: []
      },
      generatedAt: '2026-05-28T00:00:00.000Z'
    });

    assert.equal(report.cdpPort, '59036');
    assert.equal(report.nextAction.id, 'handoff-resume');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target auth check can write a non-proof status file under outputs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-auth-check-status-'));
  try {
    const pack = scaffold(root);
    const report = await buildTargetAuthCheck(pack.dir, {
      observe: {
        url: 'https://accounts.vendor-service.com/login',
        title: 'Sign in',
        counts: { controls: 2 },
        controls: [{ type: 'password', name: 'Password' }],
        forms: [],
        textSample: 'this must not be written'
      },
      statusOut: 'auth-check-status.json',
      generatedAt: '2026-05-28T00:00:00.000Z'
    });

    assert.equal(report.ok, false);
    assert.equal(report.proofPath, '');
    assert.ok(report.statusPath.endsWith('vendor-service/outputs/auth-check-status.json'));
    const written = JSON.parse(fs.readFileSync(report.statusPath, 'utf8'));
    assert.equal(written.ok, false);
    assert.equal(written.loginLike, true);
    assert.equal(JSON.stringify(written).includes('this must not be written'), false);
    assert.match(formatTargetAuthCheckCompact(report), /^status: .*auth-check-status\.json$/m);
    assert.match(formatTargetAuthCheckMarkdown(report), /Status written:/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target auth check rejects status output paths outside outputs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-auth-check-status-bad-'));
  try {
    const pack = scaffold(root);
    await assert.rejects(
      () => buildTargetAuthCheck(pack.dir, {
        observe: {
          url: 'https://app.vendor-service.com/dashboard',
          title: 'Dashboard',
          counts: {},
          controls: [],
          forms: []
        },
        statusOut: '../auth-check-status.json'
      }),
      /invalid output path/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target auth watch polls until auth check succeeds without capture', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-auth-watch-ok-'));
  try {
    const pack = scaffold(root);
    let currentMs = 0;
    const seenStatusOut = [];
    const result = await buildTargetAuthWatch(pack.dir, {
      timeoutMs: 100,
      intervalMs: 10,
      statusOut: 'auth-watch-status.json',
      now: () => currentMs,
      sleep: async (ms) => {
        currentMs += ms;
      },
      authCheckBuilder: async (_targetDir, options) => {
        seenStatusOut.push(options.statusOut);
        const ok = seenStatusOut.length === 2;
        return {
          generatedAt: `2026-05-28T00:00:0${seenStatusOut.length}.000Z`,
          target: 'vendor-service',
          dir: pack.dir,
          profile: 'vendor-service',
          ok,
          sameOrigin: true,
          loginLike: !ok,
          finalUrl: ok ? 'https://app.vendor-service.com/dashboard' : 'https://accounts.vendor-service.com/login',
          title: ok ? 'Dashboard' : 'Sign in',
          statusPath: path.join(pack.dir, 'outputs', options.statusOut),
          nextAction: { id: ok ? 'capture' : 'handoff-resume' }
        };
      }
    });

    assert.equal(result.status, 'authenticated');
    assert.equal(result.ok, true);
    assert.equal(result.attemptCount, 2);
    assert.deepEqual(seenStatusOut, ['auth-watch-status.json', 'auth-watch-status.json']);
    const written = JSON.parse(fs.readFileSync(path.join(pack.dir, 'outputs/auth-watch-status.json'), 'utf8'));
    assert.equal(written.status, 'authenticated');
    assert.equal(written.attemptCount, 2);
    assert.equal(written.authCheck.ok, true);
    const compact = formatTargetAuthWatchCompact(result);
    assert.match(compact, /^status: authenticated$/m);
    assert.match(compact, /^attempts: 2$/m);
    assert.match(compact, /^final_url: \[redacted\]$/m);
    assert.match(compact, /^title: \[redacted\]$/m);
    assert.doesNotMatch(compact, /https:\/\/app\.vendor-service\.com\/dashboard/);
    assert.doesNotMatch(compact, /Dashboard/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target auth watch times out without starting capture', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-auth-watch-timeout-'));
  try {
    const pack = scaffold(root);
    const result = await buildTargetAuthWatch(pack.dir, {
      timeoutMs: 0,
      intervalMs: 10,
      statusOut: 'auth-watch-status.json',
      now: () => 0,
      sleep: async () => {
        throw new Error('sleep should not run after timeout');
      },
      authCheckBuilder: async (_targetDir, options) => ({
        generatedAt: '2026-05-28T00:00:00.000Z',
        target: 'vendor-service',
        dir: pack.dir,
        profile: 'vendor-service',
        ok: false,
        sameOrigin: true,
        loginLike: true,
        finalUrl: 'https://accounts.vendor-service.com/login',
        title: 'Sign in',
        statusPath: path.join(pack.dir, 'outputs', options.statusOut),
        nextAction: { id: 'handoff-resume' }
      })
    });

    assert.equal(result.status, 'timed-out');
    assert.equal(result.ok, false);
    assert.equal(result.attemptCount, 1);
    assert.equal(result.secretValuesRead, false);
    assert.equal(result.destructiveActionsIncluded, false);
    const written = JSON.parse(fs.readFileSync(path.join(pack.dir, 'outputs/auth-watch-status.json'), 'utf8'));
    assert.equal(written.status, 'timed-out');
    assert.equal(written.attemptCount, 1);
    assert.equal(written.authCheck.ok, false);
    const compact = formatTargetAuthWatchCompact(result);
    assert.match(compact, /^next_action: handoff-resume$/m);
    assert.match(compact, /^final_url: \[redacted\]$/m);
    assert.match(compact, /^title: \[redacted\]$/m);
    assert.doesNotMatch(compact, /https:\/\/accounts\.vendor-service\.com\/login/);
    assert.doesNotMatch(compact, /Sign in/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
