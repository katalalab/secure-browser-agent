import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunGateAudit, formatRunGateAuditCompact } from '../src/run-gate-audit.mjs';

test('run gate audit classifies run-capable surfaces without executing work', () => {
  const audit = buildRunGateAudit({
    generatedAt: '2026-05-31T00:00:00.000Z'
  });

  assert.equal(audit.safeMode, true);
  assert.equal(audit.destructiveActionsIncluded, false);
  assert.equal(audit.secretValuesRead, false);
  assert.equal(audit.opensBrowserNow, false);
  assert.equal(audit.startsCaptureNow, false);
  assert.equal(audit.startsBackgroundProcessNow, false);
  assert.equal(audit.summary.unguardedAgentDangerous, 0);
  assert.equal(audit.summary.okForAgentLoops, true);
  assert.ok(audit.surfaces.some((surface) => surface.id === 'agent-loop-step' && surface.agentMayRunUnattended && /revalidates command target/.test(surface.guard)));
  assert.ok(audit.surfaces.some((surface) => surface.id === 'objective-resume' && surface.operatorOkRequired));
  assert.ok(audit.surfaces.some((surface) => surface.id === 'target-approval-resume' && surface.exactOperatorOkRequired));
  assert.ok(audit.surfaces.some((surface) => surface.id === 'target-handoff-resume' && surface.preferredAgentSurface === 'target-handoff-resume-watch --run --operator-ok OK'));
  assert.ok(audit.surfaces.some((surface) => surface.id === 'target-proof-capture' && !surface.agentMayRunUnattended && !surface.operatorOkRequired));
});

test('run gate audit compact output is low-token and exposes safety counts', () => {
  const compact = formatRunGateAuditCompact(buildRunGateAudit({
    generatedAt: '2026-05-31T00:00:00.000Z'
  }));

  assert.match(compact, /^safe_mode: yes$/m);
  assert.match(compact, /^secret_values_read: no$/m);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^starts_capture_now: no$/m);
  assert.match(compact, /^exact_operator_ok_required: 9$/m);
  assert.match(compact, /^unguarded_agent_dangerous: 0$/m);
  assert.match(compact, /^ok_for_agent_loops: yes$/m);
  assert.match(compact, /^surface_agent-proof-step_operator_ok_required: yes$/m);
  assert.match(compact, /^surface_agent-proof-step_exact_operator_ok_required: yes$/m);
  assert.match(compact, /^surface_agent-loop-step_guard: allowlisted monitor-only target-auth-watch shape; saved agent-loop-step-status revalidates command target and hides stale run_command$/m);
  assert.match(compact, /^surface_target-approval-resume_exact_operator_ok_required: yes$/m);
  assert.match(compact, /^surface_target-approval-resume_preferred_agent_surface: target-approval-resume --run --operator-ok OK$/m);
  assert.match(compact, /^surface_target-handoff-resume_preferred_agent_surface: target-handoff-resume-watch --run --operator-ok OK$/m);
  assert.match(compact, /^surface_target-auth-watch_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^surface_target-proof-capture_agent_may_run_unattended: no$/m);
});
