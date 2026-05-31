import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReadinessAudit, formatReadinessAuditCompact, formatReadinessAuditMarkdown } from '../src/readiness-audit.mjs';

const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const providerReport = {
  recommendation: {
    defaultBackend: 'direct-cdp-chrome',
    defaultAgentInterface: 'secure-browser-agent-mcp',
    adoptionNext: 'keep-direct-cdp-default-and-run-provider-doctors-before-changing-backends',
    lightpandaNext: 'install-or-configure-lightpanda-binary-then-benchmark',
    playwrightNext: 'use-for-rich-tests-not-default-auth-scraping',
    seleniumNext: 'install-selenium-webdriver-only-if-grid-compatibility-is-needed'
  },
  status: {
    lightpanda: { binaryExists: false, binaryPath: '' }
  },
  providers: [
    { id: 'direct-cdp-chrome' },
    { id: 'secure-browser-agent-mcp' },
    { id: 'chrome-devtools-mcp' },
    { id: 'playwright' },
    { id: 'lightpanda' },
    { id: 'selenium' }
  ],
  sources: [{ id: 'chrome-devtools-mcp' }, { id: 'playwright-auth' }]
};

const sourceAudit = {
  summary: {
    presentTargets: 10,
    totalTargets: 10,
    readiness: {
      agentBrowser: true,
      lightpandaBinary: false,
      seleniumWebdriver: false
    }
  }
};

const chromeExtensionStatus = {
  safeMode: true,
  destructiveActionsIncluded: false,
  secretValuesRead: false,
  decision: {
    everydayChromeViaCodexExtensionPrepared: true,
    everydayChromeViaCodexExtensionBackendAvailable: false,
    everydayChromeViaCodexExtensionReady: false,
    everydayChromeViaCdpAllowed: false
  }
};

function strongTargetProof(overrides = {}) {
  return {
    ok: true,
    realExternal: true,
    target: 'vendor-service',
    externalOrigins: ['https://app.vendor-service.com'],
    profileLikelyAuthenticated: true,
    audit: { ok: true },
    authCheck: {
      ok: true,
      loginLike: false,
      finalUrl: 'https://app.vendor-service.com/dashboard'
    },
    benchmark: { ok: true },
    outputs: [{ path: '/tmp/observe.json', exists: true, bytes: 10 }],
    checks: [
      { level: 'error', name: 'target.audit.ok', ok: true },
      { level: 'error', name: 'authCheck.ok', ok: true },
      { level: 'error', name: 'outputs.present', ok: true },
      { level: 'error', name: 'benchmark.present', ok: true }
    ],
    ...overrides
  };
}

test('readiness audit maps objective requirements to current evidence', () => {
  const audit = buildReadinessAudit({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    providerReport,
    sourceAudit,
    chromeExtensionStatus,
    providerBenchmarkProofs: []
  });

  assert.equal(audit.readyForLocalAuthenticatedDevelopment, true);
  assert.equal(audit.completeAgainstObjective, false);
  assert.equal(audit.requirements.find((item) => item.id === 'credential-boundary').status, 'proved');
  assert.equal(audit.requirements.find((item) => item.id === 'agent-interface').status, 'proved');
  assert.equal(audit.requirements.find((item) => item.id === 'operate-analyze-scrape').status, 'proved');
  assert.equal(audit.requirements.find((item) => item.id === 'real-external-auth-target').status, 'manual-required');
  assert.equal(audit.requirements.find((item) => item.id === 'lightpanda-public-benchmark').status, 'manual-required');
  assert.ok(audit.next.some((item) => item.includes('real-external-auth-target')));
});

test('readiness audit markdown summarizes remaining manual validation', () => {
  const audit = buildReadinessAudit({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    providerReport,
    sourceAudit,
    chromeExtensionStatus,
    providerBenchmarkProofs: []
  });
  const markdown = formatReadinessAuditMarkdown(audit);
  assert.match(markdown, /Secure Browser Agent Readiness Audit/);
  assert.match(markdown, /Ready for local authenticated development: yes/);
  assert.match(markdown, /Complete against objective: no/);
  assert.match(markdown, /real-external-auth-target/);
  assert.match(markdown, /Lightpanda/);
});

test('readiness audit compact summarizes proof gate without large evidence lists', () => {
  const audit = buildReadinessAudit({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    providerReport,
    sourceAudit,
    chromeExtensionStatus,
    providerBenchmarkProofs: []
  });
  const compact = formatReadinessAuditCompact(audit);
  assert.match(compact, /^ready_for_local_authenticated_development: yes$/m);
  assert.match(compact, /^complete_against_objective: no$/m);
  assert.match(compact, /^remaining: real-external-auth-target,lightpanda-public-benchmark$/m);
  assert.match(compact, /^provider_default_backend: direct-cdp-chrome$/m);
  assert.match(compact, /^provider_adoption_next: keep-direct-cdp-default-and-run-provider-doctors-before-changing-backends$/m);
  assert.match(compact, /^provider_lightpanda_next: install-or-configure-lightpanda-binary-then-benchmark$/m);
  assert.match(compact, /^provider_playwright_next: use-for-rich-tests-not-default-auth-scraping$/m);
  assert.match(compact, /^provider_selenium_next: install-selenium-webdriver-only-if-grid-compatibility-is-needed$/m);
  assert.match(compact, /^onepassword_headless_config_available: (?:true|false)$/m);
  assert.match(compact, /^onepassword_secret_run_ready: (?:true|false)$/m);
  assert.match(compact, /^onepassword_secret_run_candidate: .+$/m);
  assert.match(compact, /^onepassword_secret_run_headless: (?:true|false)$/m);
  assert.match(compact, /^onepassword_secret_run_select: present$/m);
  assert.match(compact, /^onepassword_mcp_secret_run_select: present$/m);
  assert.match(compact, /^agent_interface_agent_next: present$/m);
  assert.match(compact, /^agent_interface_mcp_agent_next: present$/m);
  assert.match(compact, /^agent_interface_agent_next_proof_plan: present$/m);
  assert.match(compact, /^agent_interface_agent_preflight: present$/m);
  assert.match(compact, /^agent_interface_mcp_agent_preflight: present$/m);
  assert.match(compact, /^agent_interface_agent_proof_checklist: present$/m);
  assert.match(compact, /^agent_interface_agent_proof_checklist_status: present$/m);
  assert.match(compact, /^agent_interface_agent_proof_closeout: present$/m);
  assert.match(compact, /^agent_interface_agent_proof_closeout_status: present$/m);
  assert.match(compact, /^agent_interface_mcp_agent_proof_checklist: present$/m);
  assert.match(compact, /^agent_interface_mcp_agent_proof_checklist_status: present$/m);
  assert.match(compact, /^agent_interface_mcp_agent_proof_closeout: present$/m);
  assert.match(compact, /^agent_interface_mcp_agent_proof_closeout_status: present$/m);
  assert.match(compact, /^agent_interface_agent_control_plane: present$/m);
  assert.match(compact, /^agent_interface_mcp_agent_control_plane: present$/m);
  assert.match(compact, /^agent_interface_agent_control_plane_status: present$/m);
  assert.match(compact, /^agent_interface_mcp_agent_control_plane_status: present$/m);
  assert.match(compact, /^agent_interface_agent_control_plane_watch: present$/m);
  assert.match(compact, /^agent_interface_mcp_agent_control_plane_watch: present$/m);
  assert.match(compact, /^agent_interface_operator_runbook: present$/m);
  assert.match(compact, /^agent_interface_mcp_operator_runbook: present$/m);
  assert.match(compact, /^agent_interface_mcp_handoff_compact: present$/m);
  assert.match(compact, /^agent_interface_mcp_next_action_compact: present$/m);
  assert.match(compact, /^agent_interface_run_gate_audit: present$/m);
  assert.match(compact, /^agent_interface_run_gate_ok_for_agent_loops: true$/m);
  assert.match(compact, /^agent_interface_run_gate_unguarded_agent_dangerous: 0$/m);
  assert.match(compact, /^agent_interface_run_gate_operator_gated: \d+$/m);
  assert.match(compact, /^agent_interface_run_gate_direct_operator: \d+$/m);
  assert.match(compact, /^everyday_chrome_apple_events_status: present$/m);
  assert.match(compact, /^everyday_chrome_apple_events_enable_plan: present$/m);
  assert.match(compact, /^everyday_chrome_apple_events_outline: present$/m);
  assert.match(compact, /^everyday_chrome_apple_events_inspect_fallback: present$/m);
  assert.match(compact, /^accepted_external_proofs: 0$/m);
  assert.match(compact, /^remaining_real-external-auth-target_status: manual-required$/m);
  assert.match(compact, /^next: .*real-external-auth-target/m);
  assert.doesNotMatch(compact, /^mcpTools=/m);
});

test('readiness audit distinguishes loaded headless env from runnable local env-file wrapper', () => {
  const audit = buildReadinessAudit({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    providerReport,
    sourceAudit,
    chromeExtensionStatus,
    providerBenchmarkProofs: [],
    secretAudit: {
      headlessReady: false,
      headlessConfigAvailable: true,
      recommendedHeadlessMode: 'not-configured',
      secretValuesRead: false,
      capabilities: {
        serviceAccountConfigured: false,
        connectConfigured: false,
        serviceAccountEnvFileUsable: true,
        headlessConfigAvailable: true
      },
      op: { exists: true, version: '2.34.0-test' }
    },
    secretRunSelect: {
      readyToRunNow: true,
      selectedCandidate: 'service-account-env-file',
      headless: true
    }
  });
  const compact = formatReadinessAuditCompact(audit);
  assert.match(compact, /^onepassword_headless_ready: false$/m);
  assert.match(compact, /^onepassword_headless_config_available: true$/m);
  assert.match(compact, /^onepassword_secret_run_ready: true$/m);
  assert.match(compact, /^onepassword_secret_run_candidate: service-account-env-file$/m);
  assert.match(compact, /^onepassword_secret_run_headless: true$/m);
});

test('readiness audit accepts a written real external target proof', () => {
  const audit = buildReadinessAudit({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    providerReport,
    sourceAudit,
    chromeExtensionStatus,
    targetProofs: [
      {
        path: '/tmp/target-proof.json',
        proof: strongTargetProof()
      }
    ]
  });
  assert.equal(audit.requirements.find((item) => item.id === 'real-external-auth-target').status, 'proved');
});

test('readiness audit rejects weak real external proof objects', () => {
  const audit = buildReadinessAudit({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    providerReport,
    sourceAudit,
    chromeExtensionStatus,
    targetProofs: [
      {
        path: '/tmp/weak-target-proof.json',
        proof: {
          ok: true,
          realExternal: true,
          target: 'vendor-service'
        }
      }
    ]
  });
  assert.equal(audit.requirements.find((item) => item.id === 'real-external-auth-target').status, 'manual-required');
});

test('readiness audit reads Lightpanda binary status from provider localStatus', () => {
  const audit = buildReadinessAudit({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    providerReport: {
      ...providerReport,
      status: undefined,
      localStatus: {
        lightpanda: {
          binaryExists: true,
          binaryPath: '/tmp/lightpanda'
        }
      }
    },
    sourceAudit,
    chromeExtensionStatus,
    providerBenchmarkProofs: []
  });
  const item = audit.requirements.find((requirement) => requirement.id === 'lightpanda-public-benchmark');
  assert.equal(item.status, 'partial');
  assert.ok(item.evidence.includes('binaryPath=/tmp/lightpanda'));
});

test('readiness audit accepts public Lightpanda benchmark proof as adopt or reject evidence', () => {
  const audit = buildReadinessAudit({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    providerReport,
    sourceAudit,
    chromeExtensionStatus,
    providerBenchmarkProofs: [
      {
        path: '/tmp/lightpanda-public.json',
        report: {
          fixture: { url: 'https://example.com' },
          results: [
            { provider: 'lightpanda', ok: false, skipped: false, reason: 'unsupported Web API' }
          ]
        }
      }
    ]
  });
  const item = audit.requirements.find((requirement) => requirement.id === 'lightpanda-public-benchmark');
  assert.equal(item.status, 'proved');
  assert.ok(item.evidence.includes('lightpandaPublicDecisions=1'));
  assert.match(item.evidence.join('\n'), /rejected: \/tmp\/lightpanda-public\.json/);
});

test('readiness audit accepts standalone Lightpanda decision proof', () => {
  const audit = buildReadinessAudit({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    providerReport,
    sourceAudit,
    chromeExtensionStatus,
    providerBenchmarkProofs: [
      {
        path: '/tmp/lightpanda-decision.json',
        report: {
          type: 'lightpanda-public-decision',
          provider: 'lightpanda',
          ok: true,
          decision: 'reject',
          reason: 'binary missing on this Mac'
        }
      }
    ]
  });
  const item = audit.requirements.find((requirement) => requirement.id === 'lightpanda-public-benchmark');
  assert.equal(item.status, 'proved');
  assert.ok(item.evidence.includes('lightpandaPublicDecisions=1'));
  assert.match(item.evidence.join('\n'), /rejected: \/tmp\/lightpanda-decision\.json/);
});

test('readiness audit includes MCP doctor and runtime cleanup evidence', () => {
  const audit = buildReadinessAudit({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    providerReport,
    sourceAudit,
    chromeExtensionStatus
  });
  const interfaceItem = audit.requirements.find((item) => item.id === 'agent-interface');
  assert.match(interfaceItem.evidence.join('\n'), /sba_chrome_control_plan/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_agent_workflow/);
  assert.ok(interfaceItem.evidence.includes('agentNextProofPlan=present'));
  assert.match(interfaceItem.evidence.join('\n'), /sba_agent_task/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_agent_task_watch/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_agent_loop_step/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_browser_route/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_backend_matrix/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_chrome_extension_status/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_chrome_extension_handoff/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_chrome_apple_events_status/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_chrome_apple_events_enable_plan/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_chrome_apple_events_outline/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_lightpanda_doctor/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_lightpanda_decision/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_selenium_doctor/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_provider_benchmark/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_objective_next/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_objective_status/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_objective_safe_command/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_objective_proof_pipeline/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_operator_pack/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_operator_runbook/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_proof_gate_status/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_proof_gate_watch/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_background_proof_capture_plan/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_objective_resume/);
  assert.match(interfaceItem.evidence.join('\n'), /mcpProofGateStatus=present/);
  assert.match(interfaceItem.evidence.join('\n'), /mcpProofGateWatch=present/);
  assert.match(interfaceItem.evidence.join('\n'), /mcpOperatorPack=present/);
  assert.match(interfaceItem.evidence.join('\n'), /operatorRunbook=present/);
  assert.match(interfaceItem.evidence.join('\n'), /mcpOperatorRunbook=present/);
  assert.match(interfaceItem.evidence.join('\n'), /agentProofCloseoutStatus=present/);
  assert.match(interfaceItem.evidence.join('\n'), /mcpAgentProofCloseoutStatus=present/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_runtime_cleanup_plan/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_target_bootstrap_plan/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_target_candidate_plan/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_target_proof_inventory/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_target_proof_next/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_target_proof_plan/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_target_auth_check/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_target_auth_watch/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_target_proof_capture/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_target_login_capture/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_target_handoff_status/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_target_handoff_run/);
  assert.match(interfaceItem.evidence.join('\n'), /sba_chrome_extension_resume/);
  assert.ok(interfaceItem.evidence.includes('mcpCompactSmoke=present'));
  assert.ok(interfaceItem.evidence.includes('mcpCompactNextActions=present'));
  assert.ok(interfaceItem.evidence.includes('mcpCompactHandoff=present'));
  assert.ok(interfaceItem.evidence.includes('mcpCompactChromeControlPlan=present'));
  assert.ok(interfaceItem.evidence.includes('mcpCompactBrowserRoute=present'));
  assert.ok(interfaceItem.evidence.includes('mcpCompactChromeExtensionStatus=present'));
  assert.ok(interfaceItem.evidence.includes('mcpCompactChromeExtensionHandoff=present'));
  assert.ok(interfaceItem.evidence.includes('mcpCompactChromeExtensionResume=present'));
  assert.ok(interfaceItem.evidence.includes('chromeControlPlan=present'));
  assert.ok(interfaceItem.evidence.includes('browserRoute=present'));
  assert.ok(interfaceItem.evidence.includes('mcpBrowserRoute=present'));
  assert.ok(interfaceItem.evidence.includes('mcpChromeControlPlan=present'));
  assert.ok(interfaceItem.evidence.includes('chromeExtensionStatus=present'));
  assert.ok(interfaceItem.evidence.includes('mcpChromeExtensionStatus=present'));
  assert.ok(interfaceItem.evidence.includes('chromeExtensionHandoff=present'));
  assert.ok(interfaceItem.evidence.includes('mcpChromeExtensionHandoff=present'));
  assert.ok(interfaceItem.evidence.includes('chromeExtensionResume=present'));
  assert.ok(interfaceItem.evidence.includes('mcpChromeExtensionResume=present'));
  assert.ok(interfaceItem.evidence.includes('chromeAppleEventsStatus=present'));
  assert.ok(interfaceItem.evidence.includes('mcpChromeAppleEventsStatus=present'));
  assert.ok(interfaceItem.evidence.includes('chromeAppleEventsEnablePlan=present'));
  assert.ok(interfaceItem.evidence.includes('mcpChromeAppleEventsEnablePlan=present'));
  assert.ok(interfaceItem.evidence.includes('chromeAppleEventsOutline=present'));
  assert.ok(interfaceItem.evidence.includes('mcpChromeAppleEventsOutline=present'));
  assert.ok(interfaceItem.evidence.includes('everydayChromeAppleEventsInspectFallback=present'));
  assert.ok(interfaceItem.evidence.includes('agentWorkflow=present'));
  assert.ok(interfaceItem.evidence.includes('mcpAgentWorkflow=present'));
  assert.ok(interfaceItem.evidence.includes('agentTask=present'));
  assert.ok(interfaceItem.evidence.includes('mcpAgentTask=present'));
  assert.ok(interfaceItem.evidence.includes('mcpAgentTaskWatchLoop=present'));
  assert.ok(interfaceItem.evidence.includes('agentLoopStep=present'));
  assert.ok(interfaceItem.evidence.includes('mcpAgentLoopStep=present'));
  assert.ok(interfaceItem.evidence.includes('backendMatrix=present'));
  assert.ok(interfaceItem.evidence.includes('mcpBackendMatrix=present'));
  assert.ok(interfaceItem.evidence.includes('objectiveSafeCommand=present'));
  assert.ok(interfaceItem.evidence.includes('objectiveProofPipeline=present'));
  assert.ok(interfaceItem.evidence.includes('mcpObjectiveProofPipeline=present'));
  assert.ok(interfaceItem.evidence.includes('mcpBackgroundProofCapture=present'));
  assert.ok(interfaceItem.evidence.includes('everydayChromeExtensionPrepared=true'));
  assert.ok(interfaceItem.evidence.includes('everydayChromeExtensionBackendAvailable=false'));
  assert.ok(interfaceItem.evidence.includes('everydayChromeExtensionReady=false'));
  assert.ok(interfaceItem.evidence.includes('everydayChromeCdpAllowed=false'));
  assert.ok(interfaceItem.evidence.includes('chromeExtensionSecretValuesRead=false'));

  const runtimeItem = audit.requirements.find((item) => item.id === 'runtime-hygiene');
  assert.equal(runtimeItem.status, 'proved');
  assert.ok(runtimeItem.evidence.includes('probe:runtime-cleanup-plan=present'));
  assert.ok(runtimeItem.evidence.includes('mcpRuntimeCleanupPlan=present'));

  const credentialItem = audit.requirements.find((item) => item.id === 'credential-boundary');
  assert.ok(credentialItem.evidence.includes('secretRunPlan=present'));
  assert.ok(credentialItem.evidence.includes('secretRunSelect=present'));
  assert.ok(credentialItem.evidence.includes('secretEnvHandoff=present'));
  assert.ok(credentialItem.evidence.includes('mcpSecretRunPlan=present'));
  assert.ok(credentialItem.evidence.includes('mcpSecretRunSelect=present'));
  assert.ok(credentialItem.evidence.includes('mcpSecretEnvHandoff=present'));

  const lightpandaItem = audit.requirements.find((item) => item.id === 'lightpanda-public-benchmark');
  assert.ok(lightpandaItem.evidence.includes('mcpDoctor=present'));

  const providerItem = audit.requirements.find((item) => item.id === 'provider-decision');
  assert.ok(providerItem.evidence.includes('seleniumDoctor=present'));
  assert.ok(providerItem.evidence.includes('providerAdoptionNext=keep-direct-cdp-default-and-run-provider-doctors-before-changing-backends'));
  assert.ok(providerItem.evidence.includes('lightpandaNext=install-or-configure-lightpanda-binary-then-benchmark'));
  assert.ok(providerItem.evidence.includes('playwrightNext=use-for-rich-tests-not-default-auth-scraping'));
  assert.ok(providerItem.evidence.includes('seleniumNext=install-selenium-webdriver-only-if-grid-compatibility-is-needed'));

  const sourceItem = audit.requirements.find((item) => item.id === 'reference-research');
  assert.ok(sourceItem.evidence.includes('seleniumDoctor=present'));
  assert.ok(sourceItem.evidence.includes('mcpSeleniumDoctor=present'));

  const externalItem = audit.requirements.find((item) => item.id === 'real-external-auth-target');
  assert.ok(externalItem.evidence.includes('targetBootstrapPlan=present'));
  assert.ok(externalItem.evidence.includes('targetCandidatePlan=present'));
  assert.ok(externalItem.evidence.includes('targetProofInventory=present'));
  assert.ok(externalItem.evidence.includes('targetProofNext=present'));
  assert.ok(externalItem.evidence.includes('targetProofPlan=present'));
  assert.ok(externalItem.evidence.includes('targetAuthCheck=present'));
  assert.ok(externalItem.evidence.includes('targetAuthWatch=present'));
  assert.ok(externalItem.evidence.includes('targetProofCapture=present'));
  assert.ok(externalItem.evidence.includes('targetLoginCapture=present'));
  assert.ok(externalItem.evidence.includes('targetHandoffStatus=present'));
  assert.ok(externalItem.evidence.includes('targetHandoffRun=present'));
  assert.ok(externalItem.evidence.includes('targetHandoffResume=present'));
});
