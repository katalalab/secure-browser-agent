// Tool definitions 1291-2328 of the former listMcpTools() in src/mcp-server.mjs.
export function listMcpToolsPart2() {
  return [
    {
      name: 'sba_selenium_doctor',
      title: 'Secure Browser Agent Selenium Doctor',
      description: 'Read-only Selenium/WebDriver BiDi readiness check: selenium-webdriver package, browser drivers, Selenium Server/Grid, Java, Node, and local smoke readiness.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_audit',
      title: 'Secure Browser Agent Secret Audit',
      description: 'Read-only 1Password/headless secret boundary audit. Reports configured modes and process signals without reading secret values.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_setup_plan',
      title: 'Secure Browser Agent Secret Setup Plan',
      description: 'Read-only operator plan for configuring 1Password Service Account, Connect, or local desktop secret access without exposing secret values.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['service-account', 'connect', 'local-desktop'] },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_run_plan',
      title: 'Secure Browser Agent Secret Run Plan',
      description: 'Read-only op run wrapper plan for running selected SBA commands with 1Password secret injection while keeping browser login state in target profiles.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['service-account', 'connect'] },
          command: { type: 'string', enum: ['control-status', 'secret-audit', 'target-login-capture', 'target-proof-capture'] },
          targetDir: { type: 'string' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_run_select',
      title: 'Secure Browser Agent Secret Run Selector',
      description: 'Read-only selector for choosing the safest currently available 1Password headless or desktop secret mode and the matching op-run command.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', enum: ['control-status', 'secret-audit', 'target-login-capture', 'target-proof-capture'] },
          targetDir: { type: 'string' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_env_handoff',
      title: 'Secure Browser Agent Secret Environment Handoff',
      description: 'Read-only 1Password Environments handoff for non-browser secrets: MCP approval steps, optional local .env mount plan, and op-run boundaries without reading secret values.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['environment-local-env', 'service-account', 'connect', 'local-desktop'] },
          environmentName: { type: 'string' },
          mountPath: { type: 'string' },
          write: { type: 'boolean', description: 'Write the handoff JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative handoff path. Defaults to operator/secret-env-handoff.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_env_handoff_status',
      title: 'Secure Browser Agent Secret Environment Handoff Status',
      description: 'Read saved 1Password Environments handoff JSON under runs/ without recomputing secret posture or reading secret values.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative handoff path. Defaults to operator/secret-env-handoff.json.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_env_handoff_watch',
      title: 'Secure Browser Agent Secret Environment Handoff Watch',
      description: 'Guarded one-step refresh for saved 1Password Environments handoff JSON; writes only under runs/ and never reads secret values.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          in: { type: 'string', description: 'runs/-relative handoff path. Defaults to operator/secret-env-handoff.json.' },
          out: { type: 'string', description: 'runs/-relative handoff path. Defaults to the input path.' },
          staleAfterSeconds: { type: 'number' },
          mode: { type: 'string', enum: ['environment-local-env', 'service-account', 'connect', 'local-desktop'] },
          environmentName: { type: 'string' },
          mountPath: { type: 'string' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_providers',
      title: 'Secure Browser Agent Provider Report',
      description: 'Read-only provider recommendation and local availability for Chrome CDP, secure-browser-agent MCP, Chrome DevTools MCP, Playwright, Lightpanda, and Selenium.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_backend_matrix',
      title: 'Secure Browser Agent Backend Matrix',
      description: 'Read-only task-by-backend decision matrix for search, analysis, scrape, operate, everyday Chrome, authenticated scraping, public crawling, and compatibility lanes.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Persist the matrix JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Default: operator/backend-matrix-latest.json.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve the operator opt-in for a fresh everyday-Chrome background tab in existing-tab route and selector commands.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name for the operator-provided background tab URL; the value is never read.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_backend_matrix_status',
      title: 'Secure Browser Agent Backend Matrix Status',
      description: 'Read the latest saved backend matrix without recomputing provider, Chrome, or route status.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved matrix JSON. Default: operator/backend-matrix-latest.json.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve the operator opt-in in generated refresh/status/existing-tab commands.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name for the operator-provided background tab URL; the value is never read.' },
          staleAfterSeconds: { type: 'number', description: 'Freshness threshold for the saved matrix. Default: 900.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_provider_benchmark',
      title: 'Secure Browser Agent Provider Benchmark',
      description: 'Benchmark public or synthetic pages across provider candidates and optionally write a proof JSON under runs/provider-benchmarks.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Optional public http(s) URL. Omit for synthetic data fixture.' },
          quick: { type: 'boolean', description: 'Only benchmark direct CDP cold and daemon modes.' },
          iterations: { type: 'number' },
          rows: { type: 'number', description: 'Synthetic row count when url is omitted.' },
          write: { type: 'boolean', description: 'Write JSON benchmark proof under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to provider-benchmarks/latest.json when write is true.' }
        }
      }
    },
    {
      name: 'sba_readiness_audit',
      title: 'Secure Browser Agent Readiness Audit',
      description: 'Map the full browser-agent objective to current proof, partial coverage, manual validation, and missing implementation.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_completion_audit',
      title: 'Secure Browser Agent Objective Completion Audit',
      description: 'Strict completion gate for the full browser-agent objective. Reports complete only when every readiness criterion is proved.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Persist the completion audit JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Default: operator/objective-completion-audit-latest.json.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_completion_audit_status',
      title: 'Secure Browser Agent Objective Completion Audit Status',
      description: 'Read a saved objective-completion-audit JSON without recomputing browser state. Does not open Chrome, start capture, read browser storage, or read secrets.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved objective completion audit JSON path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved audits.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_completion_audit_watch',
      title: 'Secure Browser Agent Objective Completion Audit Watch',
      description: 'Refresh a missing, stale, or parse-broken saved objective completion audit only when run is true. It remains no-browser and no-secret.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          in: { type: 'string', description: 'runs/-relative saved objective completion audit JSON path.' },
          out: { type: 'string', description: 'runs/-relative output path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved audits.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_safe_command',
      title: 'Secure Browser Agent Objective Safe Command',
      description: 'Return the single safest current objective command, preferring monitor-only auth polling while proof capture is blocked on human login.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Persist the safe-command handoff JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Default: operator/objective-safe-command-latest.json.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in target-handoff-resume-watch commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in target-handoff-resume-watch commands.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_proof_pipeline',
      title: 'Secure Browser Agent Objective Proof Pipeline',
      description: 'Read-only low-token plan for the remaining real external auth proof: monitor auth now, open login when needed, and wait-auth-then-capture proof after login.',
      inputSchema: {
        type: 'object',
        properties: {
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for the monitor-auth command.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for the monitor-auth command.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_handoff',
      title: 'Secure Browser Agent Objective Handoff',
      description: 'Operator-safe handoff for the current objective: primary action, credential rules, completion audit, and next-action commands.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the handoff JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative handoff path. Defaults to objective-handoff.json when write is true.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in manual watch and objective-next commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in manual watch and objective-next commands.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_operator_pack',
      title: 'Secure Browser Agent Operator Pack',
      description: 'Generate one operator handoff bundle: control status, everyday Chrome extension readiness, objective status, proof gate status/watch, and objective handoff summaries.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the operator pack and child status JSON files under runs/operator/.' },
          out: { type: 'string', description: 'runs/-relative operator pack path. Defaults to operator/operator-pack-latest.json when write is true.' },
          agentLoopStepStatusIn: { type: 'string', description: 'runs/-relative saved agent loop step status path. Defaults to operator/agent-loop-step-latest.json.' },
          agentLoopStepTimeoutMs: { type: 'number', description: 'Timeout to embed in the saved agent loop run command. Defaults to 300000.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in low-token agent loop and handoff commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in low-token agent loop and handoff commands.' },
          chromeMcpStatusText: { type: 'string', description: 'Raw Chrome DevTools MCP status output to normalize into low-token flags.' },
          chromeMcpListPagesText: { type: 'string', description: 'Raw Chrome DevTools MCP list_pages output to normalize into low-token flags.' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Chrome DevTools MCP connection state.' },
          chromeMcpTools: { type: 'number', description: 'Optional observed Chrome DevTools MCP tool count.' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether Chrome DevTools MCP list_pages succeeded.' },
          chromeMcpPageCount: { type: 'number', description: 'Optional page count from list_pages.' },
          chromeMcpLastError: { type: 'string', description: 'Short latest Chrome DevTools MCP list_pages error.' },
          chromeMcpSource: { type: 'string', description: 'Source label for the observed Chrome MCP result.' },
          chromeExtensionBackendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Codex Chrome Extension backend availability from a live node_repl probe.' },
          chromeExtensionBackendLastError: { type: 'string', description: 'Short latest Codex Chrome Extension backend error.' },
          chromeExtensionWindowRetryAttempted: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether the selected everyday Chrome profile was already opened before a failed extension backend retry.' },
          appleEventsActiveTabObserved: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Chrome Apple Events active-tab metadata availability.' },
          appleEventsJavascriptAllowed: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Chrome Apple Events JavaScript permission state.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_operator_runbook',
      title: 'Secure Browser Agent Operator Runbook',
      description: 'Generate a low-token or markdown runbook for the current proof gate: status, Chrome retry, 1Password boundary, proof watch, primary proof command, and completion audit.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the runbook under runs/.' },
          out: { type: 'string', description: 'runs/-relative runbook path. Defaults to operator/operator-runbook.md when write is true.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in low-token operator pack and agent loop commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in low-token operator pack and agent loop commands.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_operator_pack_status',
      title: 'Secure Browser Agent Operator Pack Status',
      description: 'Read the saved JSON operator pack without recomputing children, opening Chrome, starting capture, or reading browser storage.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved JSON operator pack. Defaults to operator/operator-pack-latest.json.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_operator_runbook_status',
      title: 'Secure Browser Agent Operator Runbook Status',
      description: 'Read the saved JSON operator runbook without recomputing operator pack, opening Chrome, starting capture, or reading browser storage.',
	      inputSchema: {
	        type: 'object',
	        properties: {
	          in: { type: 'string', description: 'runs/-relative saved JSON runbook. Defaults to operator/operator-runbook-latest.json.' },
	          staleAfterSeconds: { type: 'number' },
	          objectiveCompletionAuditIn: { type: 'string', description: 'runs/-relative saved objective completion audit JSON. Defaults to operator/objective-completion-audit-latest.json.' },
	          objectiveCompletionAuditStaleAfterSeconds: { type: 'number', description: 'Freshness window for the saved objective completion audit used to promote the runbook safe-next command.' },
	          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
	        }
	      }
    },
    {
      name: 'sba_operator_runbook_watch',
      title: 'Secure Browser Agent Operator Runbook Watch',
      description: 'Refresh the saved JSON operator runbook only when missing, stale, or parse-broken. It does not open Chrome or start capture.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          in: { type: 'string', description: 'runs/-relative saved JSON runbook. Defaults to operator/operator-runbook-latest.json.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to input path.' },
          staleAfterSeconds: { type: 'number' },
          monitorTimeoutMs: { type: 'number' },
          monitorIntervalMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_next',
      title: 'Secure Browser Agent Objective Next',
      description: 'Read-only next-action selector across the full objective: real external authenticated proof and Lightpanda public benchmark.',
      inputSchema: {
        type: 'object',
        properties: {
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in manual watch commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in manual watch commands.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_status',
      title: 'Secure Browser Agent Objective Status',
      description: 'Low-token objective status: completion gate, current resume plan, saved resume, and operator-ready auth preflight when applicable.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the status JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative status output path. Defaults to operator/objective-status-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_proof_gate_status',
      title: 'Secure Browser Agent Proof Gate Status',
      description: 'Read-only proof-gate status that combines objective status and target-proof-next into one low-token external-auth proof view.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the status JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative status output path. Defaults to operator/proof-gate-status-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_proof_gate_watch',
      title: 'Secure Browser Agent Proof Gate Watch',
      description: 'Poll proof-gate status without starting proof capture, optionally writing a low-token watch JSON under runs/.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the watch JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative watch output path. Defaults to operator/proof-gate-watch-status.json when write is true.' },
          timeoutMs: { type: 'number' },
          intervalMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_login_handoff_status',
      title: 'Secure Browser Agent Login Handoff Status',
      description: 'Very small read-only status for login handoff: whether to monitor, open login, or wait-auth-then-capture without reading secrets or starting work.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the status JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative status output path. Defaults to operator/login-handoff-status-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_background_monitor_plan',
      title: 'Secure Browser Agent Background Monitor Plan',
      description: 'Read-only plan for running proof-gate-watch as a background monitor that writes status JSON without opening browsers or starting capture.',
      inputSchema: {
        type: 'object',
        properties: {
          timeoutMs: { type: 'number' },
          intervalMs: { type: 'number' },
          statusOut: { type: 'string', description: 'runs/-relative proof-gate watch status path.' },
          logPath: { type: 'string', description: 'Log path for the suggested background shell command.' },
          pidPath: { type: 'string', description: 'PID path for the suggested background shell command.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_background_proof_capture_plan',
      title: 'Secure Browser Agent Background Proof Capture Plan',
      description: 'Read-only plan for monitor-only auth polling plus a no-open background wait-auth proof capture command after the operator completes login.',
      inputSchema: {
        type: 'object',
        properties: {
          timeoutMs: { type: 'number' },
          intervalMs: { type: 'number' },
          monitorLogPath: { type: 'string', description: 'Log path for the suggested background auth monitor command.' },
          monitorPidPath: { type: 'string', description: 'PID path for the suggested background auth monitor command.' },
          captureLogPath: { type: 'string', description: 'Log path for the suggested no-open wait-auth proof capture command.' },
          capturePidPath: { type: 'string', description: 'PID path for the suggested no-open wait-auth proof capture command.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_background_proof_capture_status',
      title: 'Secure Browser Agent Background Proof Capture Status',
      description: 'Read-only status for background auth monitor and no-open proof capture jobs: PID liveness, log summaries, and target wait-auth status files without opening browsers or reading secrets.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string', description: 'Optional target pack directory. Defaults to the target discovered from the current background proof capture plan.' },
          maxLogLines: { type: 'number', description: 'Maximum sanitized log tail lines to include in structured content.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_background_proof_capture_start',
      title: 'Secure Browser Agent Background Proof Capture Start',
      description: 'Permission-gated starter for background auth monitor or no-open wait-auth proof capture. Plans by default; run requires operatorOk=OK and never adds --open-login.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['monitor', 'capture'], description: 'monitor starts auth-watch only; capture starts the no-open wait-auth capture command.' },
          run: { type: 'boolean', description: 'Start the detached background process only when true.' },
          operatorOk: { type: 'string', description: 'Must be exactly OK when run is true.' },
          force: { type: 'boolean', description: 'Allow starting even if an existing PID file appears alive.' },
          timeoutMs: { type: 'number', description: 'Wait-auth timeout for capture mode.' },
          intervalMs: { type: 'number', description: 'Wait-auth polling interval for capture mode.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for monitor mode.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for monitor mode.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_resume',
      title: 'Secure Browser Agent Objective Resume',
      description: 'Plan or run the current primary next action across the full objective. Run mode executes only the structured command selected by objective-next; browser-opening or capture-capable commands require operatorOk=OK.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Execute the selected next command. Omit for read-only plan mode.' },
          operatorOk: { type: 'string', description: 'Must be exactly OK when run=true and the selected command may open a browser or start capture.' },
          operatorReady: { type: 'boolean', description: 'Assert the operator completed required manual login/input before running an operator-gated handoff capture.' },
          manualCandidate: { type: 'string', description: 'Select a structured manual command candidate by 1-based index or id, for example open-only or login-capture-wait.' },
          waitAuthTimeoutMs: { type: 'number', description: 'When selecting login-capture-wait, add --wait-auth-timeout-ms to the generated command.' },
          waitAuthIntervalMs: { type: 'number', description: 'When selecting login-capture-wait, add --wait-auth-interval-ms to the generated command.' },
          timeoutMs: { type: 'number', description: 'Maximum child command runtime in milliseconds when run=true.' },
          write: { type: 'boolean', description: 'Write the resume result JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative resume output path. Defaults to operator/objective-resume-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_benchmark',
      title: 'Secure Browser Agent Target Benchmark',
      description: 'Benchmark target-pack recipes against cold Chrome CDP and reusable background daemon mode after a safe preflight audit.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          profile: { type: 'string' },
          recipes: { type: 'string', description: 'Comma-separated recipes such as observe,inspect,crawl-links.' },
          modes: { type: 'string', description: 'Comma-separated modes: cold,daemon.' },
          iterations: { type: 'number' },
          write: { type: 'boolean', description: 'Write JSON benchmark proof under the target pack.' },
          out: { type: 'string', description: 'Target-pack relative output path. Defaults to proof/target-benchmark.json when write is true.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_proof',
      title: 'Secure Browser Agent Target Proof',
      description: 'Build or write a secret-free proof summary for a target pack after authenticated observe/scrape/benchmark runs.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          realExternal: { type: 'boolean' },
          write: { type: 'boolean' },
          outputs: { type: 'string', description: 'Comma-separated output filenames under the pack outputs dir.' },
          benchmarkFile: { type: 'string' },
          requireBenchmark: { type: 'boolean' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_bootstrap_plan',
      title: 'Secure Browser Agent Target Bootstrap Plan',
      description: 'Read-only command plan for creating a real external authenticated target pack and producing accepted proof evidence.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Filesystem-safe target service identifier.' },
          origin: { type: 'string', description: 'Comma-separated real external origins.' },
          loginUrl: { type: 'string' },
          pageUrl: { type: 'string' },
          query: { type: 'string' },
          permissions: { type: 'string', description: 'Comma-separated permissions such as clipboard,downloads.' },
          searchProvider: { type: 'string', enum: ['duckduckgo', 'brave', 'google'] },
          strict: { type: 'boolean', description: 'Return ready=false in structured content when required inputs are missing; MCP calls do not exit.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_candidate_plan',
      title: 'Secure Browser Agent Target Candidate Plan',
      description: 'Read-only candidate list for choosing a real external authenticated service target and generating exact bootstrap-plan commands.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_candidate_plan_status',
      title: 'Secure Browser Agent Target Candidate Plan Status',
      description: 'Read saved real-external target candidate plan JSON under runs/ without recomputing candidate commands.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative candidate plan path. Defaults to operator/target-candidate-plan-latest.json.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_candidate_plan_watch',
      title: 'Secure Browser Agent Target Candidate Plan Watch',
      description: 'Guarded one-step refresh for saved target candidate plan JSON; writes only under runs/ and never opens browser work.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          in: { type: 'string', description: 'runs/-relative candidate plan path. Defaults to operator/target-candidate-plan-latest.json.' },
          out: { type: 'string', description: 'runs/-relative candidate plan path. Defaults to the input path.' },
          staleAfterSeconds: { type: 'number' },
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_approval_pack',
      title: 'Secure Browser Agent Target Approval Pack',
      description: 'Read-only-by-default approval bundle for a real external authenticated candidate: selected target, safety flags, and exact scaffold/login/proof commands. Write mode saves JSON under runs/.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          write: { type: 'boolean' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to operator/target-approval-<candidate>.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_approval_status',
      title: 'Secure Browser Agent Target Approval Status',
      description: 'Read-only low-token status for a saved target approval pack, joined with target proof inventory. It does not open Chrome, start capture, read storage, or return page content.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          in: { type: 'string', description: 'runs/-relative approval pack path. Defaults to operator/target-approval-<candidate>.json.' },
          realExternal: { type: 'boolean', description: 'Assert the saved target is operator-approved real external for inventory gating.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_approval_preflight',
      title: 'Secure Browser Agent Target Approval Preflight',
      description: 'Read-only real-external preflight for the selected approved target. It avoids default inventory ambiguity, separates agent-safe from operator-ok proof commands, and emits saved resume plan/status/watch handoffs.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_approval_resume',
      title: 'Secure Browser Agent Target Approval Resume',
      description: 'Operator-gated wrapper for the current target approval next command. Plans by default; only executes when run=true and operatorOk is exactly OK. Child stdout/stderr text is not returned.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          realExternal: { type: 'boolean', description: 'Assert the saved target is operator-approved real external for inventory gating.' },
          run: { type: 'boolean', description: 'Execute the selected next command only with operatorOk exactly OK.' },
          operatorOk: { type: 'string', description: 'Must be exactly OK when run is true.' },
          write: { type: 'boolean', description: 'Write the resume result JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to operator/target-approval-resume-latest.json when write is true.' },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_approval_resume_status',
      title: 'Secure Browser Agent Target Approval Resume Status',
      description: 'Read the saved target approval resume plan without opening Chrome, starting capture, reading storage, or returning page content.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved resume JSON. Defaults to operator/target-approval-resume-latest.json.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_approval_resume_watch',
      title: 'Secure Browser Agent Target Approval Resume Watch',
      description: 'Refresh the saved target approval resume plan only when missing, stale, or parse-broken. It never executes the browser-opening resume command.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Refresh the saved non-executing plan only when needed.' },
          in: { type: 'string', description: 'runs/-relative saved resume JSON. Defaults to operator/target-approval-resume-latest.json.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to the input path.' },
          staleAfterSeconds: { type: 'number' },
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          realExternal: { type: 'boolean' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_proof_plan',
      title: 'Secure Browser Agent Target Proof Plan',
      description: 'Read-only operator checklist for producing an accepted real external target proof from a target pack.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          realExternal: { type: 'boolean' },
          strict: { type: 'boolean', description: 'Return proofReady=false in structured content when blockers remain; MCP calls do not exit.' },
          outputs: { type: 'string', description: 'Comma-separated output filenames under the pack outputs dir.' },
          benchmarkFile: { type: 'string' },
          format: { type: 'string', enum: ['json', 'compact'] }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_auth_check',
      title: 'Secure Browser Agent Target Auth Check',
      description: 'Verify a target pack page resolves to a same-origin non-login page without reading cookie values or page text samples.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          profile: { type: 'string' },
          cdpPort: { type: 'number', description: 'Use an already-open login browser CDP port for the auth check.' },
          write: { type: 'boolean', description: 'Write proof/auth-check.json under the target pack.' },
          statusOut: { type: 'string', description: 'Write a non-proof auth status JSON under the target outputs dir.' },
          daemon: { type: 'boolean', description: 'Use the target profile CDP daemon.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Use compact for low-token polling text while structuredContent stays complete.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_auth_watch',
      title: 'Secure Browser Agent Target Auth Watch',
      description: 'Poll target auth-check without starting proof capture, updating a non-proof status JSON under target outputs.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          profile: { type: 'string' },
          cdpPort: { type: 'number', description: 'Use an already-open login browser CDP port for auth polling.' },
          statusOut: { type: 'string', description: 'Target outputs/-relative JSON status file updated after each polling attempt.' },
          timeoutMs: { type: 'number' },
          intervalMs: { type: 'number' },
          daemon: { type: 'boolean', description: 'Use the target profile CDP daemon.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Use compact for low-token polling text while structuredContent stays complete.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_proof_capture',
      title: 'Secure Browser Agent Target Proof Capture',
      description: 'Plan or run the post-login real external proof capture sequence: observe, inspect, scrape, benchmark, and secret-free proof write.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          realExternal: { type: 'boolean' },
          run: { type: 'boolean', description: 'Execute the capture sequence. Omit for read-only plan mode.' },
          waitAuth: { type: 'boolean', description: 'When run=true, poll target auth-check until the dedicated profile is authenticated before capture.' },
          authCheckPort: { type: 'number', description: 'Use an already-open login browser CDP port for auth-check polling.' },
          waitAuthTimeoutMs: { type: 'number', description: 'Maximum auth wait time in milliseconds.' },
          waitAuthIntervalMs: { type: 'number', description: 'Polling interval in milliseconds.' },
          waitAuthStatusOut: { type: 'string', description: 'Target outputs/-relative JSON status file updated after each auth wait attempt.' },
          benchmarkFile: { type: 'string' },
          applyPermissions: { type: 'boolean' },
          startDaemon: { type: 'boolean' },
          stopDaemon: { type: 'boolean' },
          completionAudit: { type: 'boolean', description: 'Include the objective completion audit summary after a successful run.' },
          cleanupOnFailure: { type: 'boolean', description: 'Defaults to true. Stop a daemon started by this capture if a later step fails.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_login_capture',
      title: 'Secure Browser Agent Target Login Capture',
      description: 'Open the dedicated headed login profile and then run the wait-auth proof capture sequence. Credentials stay in the browser profile.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          realExternal: { type: 'boolean' },
          dryRun: { type: 'boolean' },
          openOnly: { type: 'boolean', description: 'Open the headed login browser and write a post-login handoff, but do not run capture yet.' },
          handoffOut: { type: 'string', description: 'Target output-dir relative handoff path.' },
          handoffFormat: { type: 'string', enum: ['json', 'markdown'] },
          waitAuthTimeoutMs: { type: 'number', description: 'Maximum auth wait time in milliseconds.' },
          waitAuthIntervalMs: { type: 'number', description: 'Polling interval in milliseconds.' },
          waitAuthStatusOut: { type: 'string', description: 'Target outputs/-relative JSON status file updated after each auth wait attempt. Defaults to wait-auth-status.json.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_handoff_run',
      title: 'Secure Browser Agent Target Handoff Run',
      description: 'Plan or run a structured command from a target operator handoff JSON, such as post-login-capture. Shell-only handoffs are not executed.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          handoff: { type: 'string', description: 'Target output-dir relative handoff path. Defaults to operator-handoff.json.' },
          command: { type: 'string', description: 'Handoff command id. Defaults to post-login-capture.' },
          out: { type: 'string', description: 'Target output-dir relative path for saving the handoff-run result JSON.' },
          run: { type: 'boolean', description: 'Execute the selected handoff command. Omit for read-only plan mode.' },
          preflightAuth: { type: 'boolean', description: 'Check auth state before running post-login capture. Defaults to true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_handoff_status',
      title: 'Secure Browser Agent Target Handoff Status',
      description: 'Read-only summary of a target operator handoff: available command IDs, synthesized status commands, auth-check port, and recommended next command.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          handoff: { type: 'string', description: 'Target output-dir relative handoff path. Defaults to operator-handoff.json.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_handoff_resume',
      title: 'Secure Browser Agent Target Handoff Resume',
      description: 'Plan or run the safest handoff continuation: check the dedicated login browser auth state first, then run post-login proof capture only when auth is proved.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          handoff: { type: 'string', description: 'Target output-dir relative handoff path. Defaults to operator-handoff.json.' },
          out: { type: 'string', description: 'Target output-dir relative path for saving the resume result JSON.' },
          run: { type: 'boolean', description: 'Execute auth-check and, only if authenticated, the post-login capture. Omit for read-only plan mode.' },
          openLogin: { type: 'boolean', description: 'When run=true and auth is not yet proved, open the dedicated headed login browser before waiting.' },
          waitAuth: { type: 'boolean', description: 'When run=true, poll the saved handoff auth-check before capture.' },
          waitAuthTimeoutMs: { type: 'number', description: 'Maximum auth wait time in milliseconds.' },
          waitAuthIntervalMs: { type: 'number', description: 'Polling interval in milliseconds.' },
          waitAuthStatusOut: { type: 'string', description: 'Target outputs/-relative JSON status file updated after each auth wait attempt.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_handoff_resume_status',
      title: 'Secure Browser Agent Target Handoff Resume Status',
      description: 'Read-only low-token status for saved handoff resume, wait-auth, auth-watch, and auth-check files without opening browsers or starting capture.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          handoff: { type: 'string', description: 'Target output-dir relative handoff path. Defaults to operator-handoff.json.' },
          in: { type: 'string', description: 'Target output-dir relative saved handoff resume JSON. Defaults to handoff-resume-latest.json.' },
          waitAuthStatusOut: { type: 'string', description: 'Target output-dir relative wait-auth status JSON. Defaults to handoff-resume-wait-auth-status.json.' },
          authWatchIn: { type: 'string', description: 'Target output-dir relative auth-watch status JSON. Defaults to auth-watch-status.json.' },
          authCheckIn: { type: 'string', description: 'Target output-dir relative auth-check status JSON. Defaults to auth-check-status.json.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for the recommended monitor-auth command.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for the recommended monitor-auth command.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_handoff_resume_watch',
      title: 'Secure Browser Agent Target Handoff Resume Watch',
      description: 'Plan or run one low-token handoff continuation step: monitor auth while logged out, run no-open auth-first resume when auth is ready, or audit when capture is complete. Capture-capable continuations require operatorOk=OK.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          handoff: { type: 'string', description: 'Target output-dir relative handoff path. Defaults to operator-handoff.json.' },
          run: { type: 'boolean', description: 'Execute the selected safe continuation command. Omit for read-only plan mode.' },
          operatorOk: { type: 'string', description: 'Must be exactly OK when run=true and the selected continuation may start capture.' },
          in: { type: 'string', description: 'Target output-dir relative saved handoff resume JSON. Defaults to handoff-resume-latest.json.' },
          waitAuthStatusOut: { type: 'string', description: 'Target output-dir relative wait-auth status JSON. Defaults to handoff-resume-wait-auth-status.json.' },
          authWatchIn: { type: 'string', description: 'Target output-dir relative auth-watch status JSON. Defaults to auth-watch-status.json.' },
          authCheckIn: { type: 'string', description: 'Target output-dir relative auth-check status JSON. Defaults to auth-check-status.json.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for short monitor-only probes.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for short monitor-only probes.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_proof_inventory',
      title: 'Secure Browser Agent Target Proof Inventory',
      description: 'Read-only inventory of all target packs and their real external proof readiness.',
      inputSchema: {
        type: 'object',
        properties: {
          realExternal: { type: 'boolean' },
          strict: { type: 'boolean', description: 'Return complete=false in structured content when accepted external proof is missing; MCP calls do not exit.' },
          outputs: { type: 'string', description: 'Comma-separated output filenames under each pack outputs dir.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_proof_next',
      title: 'Secure Browser Agent Target Proof Next Action',
      description: 'Read-only next action selector for moving from target-pack inventory to an accepted real external proof.',
      inputSchema: {
        type: 'object',
        properties: {
          realExternal: { type: 'boolean' },
          strict: { type: 'boolean', description: 'Return complete=false in structured content when accepted external proof is missing; MCP calls do not exit.' },
          outputs: { type: 'string', description: 'Comma-separated output filenames under each pack outputs dir.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_permissions',
      title: 'Secure Browser Agent Target Permissions',
      description: 'Plan, set, apply, or inspect pack-scoped Chrome site permissions for a dedicated profile.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          action: { type: 'string', enum: ['status', 'plan', 'set', 'apply'] },
          allow: { type: 'string', description: 'Comma-separated permissions such as clipboard,downloads.' },
          origin: { type: 'string' },
          profile: { type: 'string' },
          force: { type: 'boolean' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_daemon',
      title: 'Secure Browser Agent Target Daemon',
      description: 'Start, stop, or inspect a pack-scoped background Chrome/CDP process.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          action: { type: 'string', enum: ['start', 'status', 'stop'] },
          profile: { type: 'string' },
          url: { type: 'string' },
          headed: { type: 'boolean' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_run',
      title: 'Secure Browser Agent Target Recipe Run',
      description: 'Run a scaffolded target recipe and return structured output. Uses target pack policy and profile.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          recipe: { type: 'string', enum: ['diagnose', 'observe', 'inspect', 'analyze', 'operate', 'screenshot', 'crawl', 'crawl-links', 'outline', 'links', 'search'] },
          profile: { type: 'string' },
          daemon: { type: 'boolean' },
          out: { type: 'string' },
          format: { type: 'string', enum: ['json', 'csv'] },
          result: { type: 'string' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_run_status',
      title: 'Secure Browser Agent Target Recipe Run Status',
      description: 'Read-only low-token summary of a saved target-run output. Reports freshness and result shape without returning page text or row data.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          recipe: { type: 'string', enum: ['diagnose', 'observe', 'inspect', 'analyze', 'operate', 'scrape', 'screenshot', 'crawl', 'crawl-links', 'outline', 'links', 'search'] },
          in: { type: 'string', description: 'Output path relative to the target outputDir. Defaults to the recipe output.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'] }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_operate_add',
      title: 'Secure Browser Agent Target Operate Step Add',
      description: 'Append a guarded fill/click/wait/observe/inspect/extract step to recipes/operate.json for a target pack. Use valueEnv for sensitive fill values.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          action: { type: 'string', enum: ['fill', 'click', 'wait-for', 'wait', 'observe', 'inspect', 'extract'] },
          selector: { type: 'string' },
          value: { type: 'string', description: 'Inline non-secret fill value. Use valueEnv for passwords, tokens, or account secrets.' },
          valueEnv: { type: 'string', description: 'Environment variable name resolved at runtime for fill values.' },
          text: { type: 'string' },
          urlIncludes: { type: 'string' },
          as: { type: 'string' },
          fields: { type: 'string' },
          limit: { type: 'number' },
          afterMs: { type: 'number' },
          timeoutMs: { type: 'number' },
          pollMs: { type: 'number' },
          dryRun: { type: 'boolean' }
        },
        required: ['targetDir', 'action']
      }
    },
    {
      name: 'sba_target_scrape',
      title: 'Secure Browser Agent Target Scrape',
      description: 'Analyze a target page and extract rows using the best suggested selector or a supplied selector.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          url: { type: 'string' },
          selector: { type: 'string' },
          suggestion: { type: 'number' },
          fields: { type: 'string', description: 'Comma-separated fields such as text,href.' },
          profile: { type: 'string' },
          daemon: { type: 'boolean' },
          limit: { type: 'number' },
          out: { type: 'string' },
          format: { type: 'string', enum: ['json', 'csv'] }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_cdp_analyze',
      title: 'Secure Browser Agent CDP Analyze',
      description: 'Analyze one allowlisted URL with direct CDP and return compact page, console, network, and extractor suggestions.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          profile: { type: 'string' },
          policy: { type: 'string' },
          daemon: { type: 'boolean' }
        },
        required: ['url']
      }
    }
  ];
}
