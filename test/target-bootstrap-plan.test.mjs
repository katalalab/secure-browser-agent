import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTargetBootstrapPlan, formatTargetBootstrapPlanCompact, formatTargetBootstrapPlanMarkdown } from '../src/target-bootstrap-plan.mjs';

test('target bootstrap plan builds a complete real external proof command sequence', () => {
  const plan = buildTargetBootstrapPlan({
    name: 'vendor-service',
    origin: 'https://app.vendor-service.com,https://accounts.vendor-service.com',
    loginUrl: 'https://accounts.vendor-service.com/login',
    pageUrl: 'https://app.vendor-service.com/dashboard',
    permissions: 'clipboard,downloads',
    query: 'vendor reports'
  });

  assert.equal(plan.safeMode, true);
  assert.equal(plan.destructiveActionsIncluded, false);
  assert.equal(plan.localWritesIncluded, true);
  assert.equal(plan.ready, true);
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.target, 'vendor-service');
  assert.ok(plan.origins.includes('https://app.vendor-service.com'));
  assert.ok(plan.origins.includes('https://accounts.vendor-service.com'));
  assert.equal(plan.commands[0].id, 'scaffold-target');
  assert.match(plan.commands[0].command.shell, /scaffold-target/);
  assert.ok(plan.commands.some((item) => item.id === 'login' && item.command.shell.includes('target-login') && item.command.shell.includes('--real-external')));
  const loginCapture = plan.commands.find((item) => item.id === 'login-capture');
  assert.ok(loginCapture);
  assert.match(loginCapture.command.shell, /target-login-capture/);
  assert.match(loginCapture.command.shell, /--wait-auth-status-out/);
  assert.match(loginCapture.command.shell, /wait-auth-status\.json/);
  assert.match(loginCapture.command.shell, /markdown/);
  const secretRunSelect = plan.commands.find((item) => item.id === 'secret-run-select-login-capture');
  assert.ok(secretRunSelect);
  assert.match(secretRunSelect.command.shell, /secret-run-select/);
  assert.match(secretRunSelect.command.shell, /target-login-capture/);
  assert.ok(plan.commands.some((item) => item.id === 'auth-check' && item.command.shell.includes('target-auth-check')));
  assert.ok(plan.commands.some((item) => item.id === 'observe' && item.command.shell.includes('target-run')));
  assert.ok(plan.commands.some((item) => item.id === 'write-proof' && item.command.shell.includes('--real-external') && item.command.shell.includes('--auth-check-file')));
  assert.equal(JSON.stringify(plan).includes('cookie'), false);
  assert.match(formatTargetBootstrapPlanMarkdown(plan), /Target Bootstrap Plan/);
  assert.match(formatTargetBootstrapPlanMarkdown(plan), /Ready: yes/);
  const compact = formatTargetBootstrapPlanCompact(plan);
  assert.match(compact, /^ready: yes$/m);
  assert.match(compact, /^secret_run_select_command: 'node' 'src\/cli\.mjs' 'secret-run-select'/m);
  assert.match(compact, /^login_capture_command: 'node' 'src\/cli\.mjs' 'target-login-capture'/m);
  assert.match(compact, /^write_proof_command: 'node' 'src\/cli\.mjs' 'target-proof'/m);
});

test('target bootstrap plan rejects non-real external origins', () => {
  const plan = buildTargetBootstrapPlan({
    name: 'example-public',
    origin: 'https://example.com',
    pageUrl: 'https://example.com'
  });

  assert.equal(plan.ready, false);
  assert.ok(plan.blockers.some((item) => item.includes('real external')));
  assert.equal(plan.commands.find((item) => item.id === 'scaffold-target').status, 'blocked');
  assert.match(formatTargetBootstrapPlanMarkdown(plan), /Ready: no/);
  assert.match(formatTargetBootstrapPlanCompact(plan), /^ready: no$/m);
  assert.match(formatTargetBootstrapPlanCompact(plan), /^blockers_count: 1$/m);
});
