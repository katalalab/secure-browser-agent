// Tool definitions 247-1290 of the former listMcpTools() in src/mcp-server.mjs.
import { COMPACT_COMMAND_AUDIT_SOURCES } from './compact-command-audit.mjs';

export function listMcpToolsPart1() {
  return [
    {
      name: 'sba_control_status',
      title: 'Secure Browser Agent Control Status',
      description: 'Low-token combined status for the browser automation control plane: objective, DevTools lanes, duplicated MCP helpers, 1Password/headless secret boundary, and next command.',
      inputSchema: {
        type: 'object',
        properties: {
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in agent-loop-step commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in agent-loop-step commands.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_next',
      title: 'Secure Browser Agent Next Action',
      description: 'Smallest safe next-action handoff for agent loops. It exposes an agent_run_command only when the command is safe without operator approval; browser-opening or capture-capable commands are separated as operator_approval_command.',
      inputSchema: {
        type: 'object',
        properties: {
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in agent-loop commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in agent-loop commands.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_preflight',
      title: 'Secure Browser Agent Preflight',
      description: 'Shortest safe real-external proof preflight for agent loops. It is read-only, never opens a browser, never starts capture, and defaults to the real-external completion lane.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Real external target candidate to preflight. Defaults to github.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_checklist',
      title: 'Secure Browser Agent Proof Checklist',
      description: 'Read-only low-token operator checklist for the remaining real-external proof lane. It resolves the current candidate to proof status, safe polling commands, and operator-only resume command.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Real external target candidate. Defaults to github.' },
          write: { type: 'boolean', description: 'Write the checklist JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to operator/agent-proof-checklist-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_checklist_status',
      title: 'Secure Browser Agent Proof Checklist Status',
      description: 'Read-only status for the saved agent proof checklist under runs/, including freshness and refresh command.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved checklist path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved checklist status.' },
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Fallback candidate for refresh command when no saved checklist exists.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_closeout',
      title: 'Secure Browser Agent Proof Closeout',
      description: 'Read-only low-token final proof closeout. It combines the current completion proof bundle and saved checklist status, then reports whether the real-external authenticated proof is complete.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Real external target candidate. Defaults to github.' },
          includeCompactCommandAudit: { type: 'boolean', description: 'Include the strict all-source compact command audit in the live closeout.' },
          write: { type: 'boolean', description: 'Write the closeout JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to operator/agent-proof-closeout-latest.json when write is true.' },
          checklistIn: { type: 'string', description: 'runs/-relative saved agent proof checklist path.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_closeout_status',
      title: 'Secure Browser Agent Proof Closeout Status',
      description: 'Read-only status for the saved final proof closeout under runs/, including freshness and refresh command.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved closeout path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved closeout status.' },
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Fallback candidate for refresh command when no saved closeout exists.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_workflow',
      title: 'Secure Browser Agent Workflow',
      description: 'Read-only low-token command palette for search, observe, inspect, scrape, operate, screenshot, crawl, existing-tab, and auth-proof workflows. Authenticated tasks auto-detect the current proof-gate target when targetDir is omitted.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', enum: ['auto', 'search', 'observe', 'inspect', 'analyze', 'scrape', 'operate', 'screenshot', 'diagnose', 'crawl', 'links', 'existing-tab', 'public-crawl', 'auth-proof'] },
          targetDir: { type: 'string' },
          query: { type: 'string' },
          provider: { type: 'string', enum: ['duckduckgo', 'brave', 'google'] },
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'] },
          matchOrigin: { type: 'string', description: 'Existing-tab safe selection origin for Codex Chrome Extension claim-plan.' },
          matchPath: { type: 'string', description: 'Existing-tab safe selection path for Codex Chrome Extension claim-plan.' },
          tabIndex: { type: 'number', description: 'Existing-tab index from safe openTabs metadata.' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpTools: { type: 'number' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          chromeMcpLastError: { type: 'string' },
          chromeMcpSource: { type: 'string' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Allow a connected MCP backend to return a background new_page template without listing existing tabs.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL for a fresh background tab; the value is never read by this tool.' },
          chromeExtensionPrepared: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeExtensionBackendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_backend_select',
      title: 'Secure Browser Agent Backend Select',
      description: 'Read-only task-to-backend selector combining workflow, execution gate, and backend matrix into one compact handoff. It never opens Chrome, reads browser storage, or starts capture.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', enum: ['auto', 'search', 'observe', 'inspect', 'analyze', 'scrape', 'operate', 'screenshot', 'diagnose', 'crawl', 'links', 'existing-tab', 'public-crawl', 'auth-proof'] },
          targetDir: { type: 'string' },
          query: { type: 'string' },
          provider: { type: 'string', enum: ['duckduckgo', 'brave', 'google'] },
          backendMatrixIn: { type: 'string', description: 'runs/-relative saved backend matrix JSON path. Defaults to live recomputation when omitted or unavailable.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpTools: { type: 'number' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          chromeMcpLastError: { type: 'string' },
          chromeMcpSource: { type: 'string' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Allow a connected MCP backend to return a background new_page template without listing existing tabs.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL for a fresh background tab; the value is never read by this tool.' },
          matchOrigin: { type: 'string', description: 'Optional origin selector metadata for existing-tab claim plans; raw tab URLs are not read by this tool.' },
          matchPath: { type: 'string', description: 'Optional path selector metadata for existing-tab claim plans.' },
          tabIndex: { type: 'number', description: 'Optional operator-provided tab index selector for existing-tab claim plans.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_control_plane',
      title: 'Secure Browser Agent Control Plane',
      description: 'Read-only low-token rollup of readiness, provider doctors, backend selection, objective-next, and objective-proof-pipeline for a requested browser task.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', enum: ['auto', 'search', 'analyze', 'scrape', 'operate', 'existing-tab', 'public-crawl', 'auth-proof'] },
          targetDir: { type: 'string' },
          query: { type: 'string' },
          provider: { type: 'string', enum: ['duckduckgo', 'brave', 'google'] },
          backendMatrixIn: { type: 'string', description: 'runs/-relative saved backend matrix path.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no'] },
          newBackgroundUrlEnv: { type: 'string' },
          monitorTimeoutMs: { type: 'number' },
          monitorIntervalMs: { type: 'number' },
          write: { type: 'boolean', description: 'Write JSON status under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to operator/agent-control-plane-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_control_plane_status',
      title: 'Secure Browser Agent Control Plane Status',
      description: 'Read-only status reader for a saved agent-control-plane JSON under runs/; does not recompute provider, browser, or objective state.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative input path. Defaults to operator/agent-control-plane-latest.json.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_control_plane_watch',
      title: 'Secure Browser Agent Control Plane Watch',
      description: 'Read-only-by-default saved control-plane freshness check; with run=true, refreshes only the saved JSON under runs/ and does not open browsers or start capture.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          in: { type: 'string', description: 'runs/-relative input path. Defaults to operator/agent-control-plane-latest.json.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to the input path.' },
          staleAfterSeconds: { type: 'number' },
          task: { type: 'string', enum: ['auto', 'search', 'analyze', 'scrape', 'operate', 'existing-tab', 'public-crawl', 'auth-proof'] },
          targetDir: { type: 'string' },
          query: { type: 'string' },
          provider: { type: 'string', enum: ['duckduckgo', 'brave', 'google'] },
          backendMatrixIn: { type: 'string' },
          mcpObservationIn: { type: 'string' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          newBackgroundUrlEnv: { type: 'string' },
          monitorTimeoutMs: { type: 'number' },
          monitorIntervalMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_task',
      title: 'Secure Browser Agent Task',
      description: 'Plan or run one safe agent browser task from the workflow command palette. Run mode executes only allowlisted non-destructive commands and blocks target tasks while the auth gate is closed.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Execute the selected safe command only when true. Default is plan-only.' },
          write: { type: 'boolean', description: 'Persist the task result JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path for write mode. Defaults to operator/agent-task-latest.json.' },
          task: { type: 'string', enum: ['auto', 'search', 'observe', 'inspect', 'analyze', 'scrape', 'operate', 'screenshot', 'diagnose', 'crawl', 'links', 'existing-tab', 'public-crawl', 'auth-proof'] },
          targetDir: { type: 'string' },
          query: { type: 'string' },
          provider: { type: 'string', enum: ['duckduckgo', 'brave', 'google'] },
          searchProviders: { type: 'string', description: 'Comma-separated public search fallback providers, for example brave,google,duckduckgo.' },
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'] },
          matchOrigin: { type: 'string' },
          matchPath: { type: 'string' },
          tabIndex: { type: 'number' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpTools: { type: 'number' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          chromeMcpLastError: { type: 'string' },
          chromeMcpSource: { type: 'string' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Allow a connected MCP backend to return a background new_page template without listing existing tabs.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL for a fresh background tab; the value is never read by this tool.' },
          chromeExtensionPrepared: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeExtensionBackendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_task_status',
      title: 'Secure Browser Agent Task Status',
      description: 'Read a saved agent-task result from runs/ and return compact low-token status without rerunning browser work.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved agent-task JSON path. Defaults to operator/agent-task-latest.json.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation for refresh/run recommendations.' },
          staleAfterSeconds: { type: 'number' },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_task_watch',
      title: 'Secure Browser Agent Task Watch',
      description: 'One safe low-token watch step for saved agent-task results. Plan mode only reads status; run mode executes only the saved safe agent-task refresh/run command.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Execute the safe recommended agent-task command only when true. Default is status-only plan.' },
          in: { type: 'string', description: 'runs/-relative saved agent-task JSON path. Defaults to operator/agent-task-latest.json.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation for refresh/run recommendations.' },
          staleAfterSeconds: { type: 'number' },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_task_loop',
      title: 'Secure Browser Agent Task Loop',
      description: 'Bounded low-token polling loop for saved agent-task results. Run mode executes safe agent-task-watch steps only when the saved task is missing, stale, parse-broken, or pending execution.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          in: { type: 'string' },
          iterations: { type: 'number' },
          intervalMs: { type: 'number' },
          statusOut: { type: 'string' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation for refresh/run recommendations.' },
          staleAfterSeconds: { type: 'number' },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_task_watch_start',
      title: 'Secure Browser Agent Task Watch Start',
      description: 'Plan or start a detached one-shot agent-task-watch process. Run mode requires operatorOk: OK and writes pid/log files under runs/.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          operatorOk: { type: 'string' },
          force: { type: 'boolean' },
          in: { type: 'string' },
          logPath: { type: 'string' },
          pidPath: { type: 'string' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation for watch commands.' },
          staleAfterSeconds: { type: 'number' },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_task_watch_status',
      title: 'Secure Browser Agent Task Watch Status',
      description: 'Read detached agent-task-watch pid/log state and the current saved agent-task status without starting browser work.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string' },
          logPath: { type: 'string' },
          pidPath: { type: 'string' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation for refresh/start commands.' },
          maxLogLines: { type: 'number' },
          staleAfterSeconds: { type: 'number' },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_loop_step',
      title: 'Secure Browser Agent Loop Step',
      description: 'Plan or run one safe agent-loop step. Execution is limited to the monitor-only auth watch command; browser opening, capture start, and background starts are refused.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'When true, execute the allowed monitor-only command. Default is plan-only.' },
          write: { type: 'boolean', description: 'Write the step result JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path for write mode.' },
          timeoutMs: { type: 'number', description: 'Runner timeout for the monitor-only child command.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for short monitor-only probes.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for short monitor-only probes.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_loop_step_status',
      title: 'Secure Browser Agent Loop Step Status',
      description: 'Read-only summary of the last saved agent-loop-step result under runs/. It reports freshness, execution state, and safety flags without returning child stdout text.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved agent-loop-step JSON path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved results.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional timeout override to embed in returned run command.' },
          monitorIntervalMs: { type: 'number', description: 'Optional interval override to embed in returned run command.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_step',
      title: 'Secure Browser Agent Proof Step',
      description: 'Plan or run one post-login proof step for regular Chrome handoff. Plan mode is read-only; capture-capable run mode requires operatorOk=OK and executes only no-open resume-capture after saved auth is ready; completion audit remains read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Execute the selected proof continuation only when true. Capture-capable continuations also require operatorOk exactly OK.' },
          operatorOk: { type: 'string', description: 'Must be exactly OK when run=true and the selected continuation may start capture.' },
          write: { type: 'boolean', description: 'Write the step result JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path for write mode.' },
          targetDir: { type: 'string', description: 'Target pack directory. Defaults from objective-completion-audit.' },
          handoff: { type: 'string', description: 'Target handoff JSON filename. Defaults to operator-handoff.json.' },
          timeoutMs: { type: 'number', description: 'Runner timeout for the selected proof continuation.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for short monitor probes.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for short monitor probes.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_step_start',
      title: 'Secure Browser Agent Proof Step Start',
      description: 'Plan or start a detached post-login proof step. Run mode requires operatorOk: OK and starts only when the selected proof step is no-open and allowed now.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          operatorOk: { type: 'string' },
          force: { type: 'boolean' },
          out: { type: 'string', description: 'runs/-relative saved agent-proof-step JSON path.' },
          logPath: { type: 'string', description: 'runs/-relative log path.' },
          pidPath: { type: 'string', description: 'runs/-relative pid path.' },
          targetDir: { type: 'string' },
          handoff: { type: 'string' },
          timeoutMs: { type: 'number' },
          monitorTimeoutMs: { type: 'number' },
          monitorIntervalMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_step_status',
      title: 'Secure Browser Agent Proof Step Status',
      description: 'Read-only detached proof-step status. It reports pid/log state and the saved proof-step JSON without opening Chrome, reading browser storage, or returning page content.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved agent-proof-step JSON path.' },
          logPath: { type: 'string', description: 'runs/-relative log path.' },
          pidPath: { type: 'string', description: 'runs/-relative pid path.' },
          maxLogLines: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_control_plan',
      title: 'Secure Browser Agent Chrome Control Plan',
      description: 'Read-only plan for choosing everyday Chrome, target-pack Chrome, or Codex Browser Agent Chrome based on current runtime state and Chrome remote debugging security constraints.',
      inputSchema: {
        type: 'object',
        properties: {
          lane: { type: 'string', enum: ['auto', 'target-pack', 'regular-chrome', 'codex-browser-agent'] },
          mcpObservationIn: { type: 'string', description: 'Saved normalized Chrome MCP observation path relative to runs/.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve operator opt-in for a fresh everyday-Chrome background tab in returned regular Chrome commands.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL; the value is never read.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_observation',
      title: 'Secure Browser Agent Chrome MCP Observation',
      description: 'Read-only parser that normalizes raw or already-summarized Peekaboo/Chrome DevTools MCP status and list_pages observations into low-token flags for Chrome MCP routing.',
      inputSchema: {
        type: 'object',
        properties: {
          statusText: { type: 'string', description: 'Raw text returned by mcp__peekaboo__.browser action=status.' },
          listPagesText: { type: 'string', description: 'Raw text returned by mcp__peekaboo__.browser action=list_pages.' },
          observedConnected: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Normalized observed connection flag. Prefer this over raw text when page titles or URLs must not enter CLI arguments.' },
          observedTools: { type: 'number', description: 'Normalized observed tool count.' },
          observedPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Normalized list_pages success flag.' },
          observedPageCount: { type: 'number', description: 'Normalized page count without titles or URLs.' },
          observedListPagesTimedOut: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether list_pages timed out.' },
          observedLastError: { type: 'string', description: 'Short sanitized error summary such as Network.enable timed out.' },
          source: { type: 'string', description: 'Short source label for the observation.' },
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'], description: 'Regular Chrome intent used when generating follow-up commands.' },
          write: { type: 'boolean', description: 'Persist the normalized secret-free observation under runs/.' },
          out: { type: 'string', description: 'Output path relative to runs/ when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_observation_status',
      title: 'Secure Browser Agent Chrome MCP Observation Status',
      description: 'Read-only status for the latest saved normalized Peekaboo/Chrome DevTools MCP observation, with stale detection and low-token follow-up commands.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'Saved observation path relative to runs/.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold before the saved observation is considered stale.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_status',
      title: 'Secure Browser Agent Chrome MCP Status',
      description: 'Read-only status for using everyday Chrome through Peekaboo/Chrome DevTools MCP without opening tabs, reading cookies, or treating process presence as a proved backend.',
      inputSchema: {
        type: 'object',
        properties: {
          observedConnected: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional externally observed browser tool status from Peekaboo/Chrome DevTools MCP.' },
          observedTools: { type: 'number', description: 'Optional externally observed tool count.' },
          observedPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether list_pages has succeeded for this MCP connection.' },
          observedPageCount: { type: 'number', description: 'Optional page count from a successful list_pages observation.' },
          observedLastError: { type: 'string', description: 'Short error text from the latest list_pages attempt, if any.' },
          observedSource: { type: 'string', description: 'Short source label for the observed status.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_handoff',
      title: 'Secure Browser Agent Chrome MCP Handoff',
      description: 'Read-only handoff for using the connected Peekaboo/Chrome DevTools MCP lane: next safe tool call, allowed browser actions, and security constraints for everyday Chrome tabs.',
      inputSchema: {
        type: 'object',
        properties: {
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional externally observed Chrome DevTools MCP status.' },
          chromeMcpTools: { type: 'number', description: 'Optional externally observed Chrome DevTools MCP tool count.' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether list_pages has succeeded for this MCP connection.' },
          chromeMcpPageCount: { type: 'number', description: 'Optional page count from a successful list_pages observation.' },
          chromeMcpLastError: { type: 'string', description: 'Short error text from the latest list_pages attempt, if any.' },
          chromeMcpSource: { type: 'string', description: 'Short source label for the observed Chrome MCP status.' },
          mcpObservationIn: { type: 'string', description: 'Saved normalized Chrome MCP observation path relative to runs/.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Allow a connected MCP backend to return a background new_page template without listing existing tabs.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL for a fresh background tab; the value is never read by this tool.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_timeout_plan',
      title: 'Secure Browser Agent Chrome MCP Timeout Plan',
      description: 'Read-only diagnostic plan for Chrome DevTools MCP list_pages timeouts: duplicate MCP signals, safe fallback commands, and manual cleanup guidance.',
      inputSchema: {
        type: 'object',
        properties: {
          observedConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          observedTools: { type: 'number' },
          observedPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          observedPageCount: { type: 'number' },
          observedLastError: { type: 'string' },
          observedSource: { type: 'string' },
          ownerLimit: { type: 'number' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve operator opt-in for a fresh everyday-Chrome background tab in generated regular-chrome-use commands.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL; the value is never read by this tool.' },
          write: { type: 'boolean', description: 'Persist the timeout plan under runs/.' },
          out: { type: 'string', description: 'Output path relative to runs/ when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_timeout_plan_status',
      title: 'Secure Browser Agent Chrome MCP Timeout Plan Status',
      description: 'Read-only status for the saved Chrome MCP timeout recovery handoff under runs/ without rescanning processes.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'Input path relative to runs/. Defaults to operator/chrome-mcp-timeout-plan-latest.json.' },
          staleAfterSeconds: { type: 'number' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve operator opt-in for a fresh everyday-Chrome background tab in regenerated status/refresh commands.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL; the value is never read by this tool.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_autostart_plan',
      title: 'Secure Browser Agent Chrome MCP Autostart Plan',
      description: 'Safe LaunchAgent plan for keeping Chrome DevTools MCP available. It can write a plist and JSON under runs/, but never loads launchd, starts MCP, opens Chrome, reads browser storage, or returns page content.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the LaunchAgent plist and plan JSON under runs/ only. Does not install or load it.' },
          out: { type: 'string', description: 'Output JSON path relative to runs/ when write is true.' },
          label: { type: 'string', description: 'LaunchAgent label. Defaults to local.secure-browser-agent.chrome-devtools-mcp.' },
          browserUrl: { type: 'string', description: 'Chrome DevTools URL passed to chrome-devtools-mcp --browserUrl. Defaults to http://127.0.0.1:9223.' },
          headless: { type: 'string', enum: ['yes', 'no'], description: 'Whether to add --headless to the planned MCP command.' },
          packageSpec: { type: 'string', description: 'npm package spec. Defaults to chrome-devtools-mcp@latest.' },
          plist: { type: 'string', description: 'Plist path relative to runs/. Defaults under operator/launchd/.' },
          installPath: { type: 'string', description: 'Operator install target path, usually ~/Library/LaunchAgents/<label>.plist.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_autostart_plan_status',
      title: 'Secure Browser Agent Chrome MCP Autostart Plan Status',
      description: 'Read-only status for the saved Chrome DevTools MCP LaunchAgent plan. It checks saved files only and does not run launchctl.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'Input JSON path relative to runs/. Defaults to operator/chrome-mcp-autostart-plan-latest.json.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_regular_chrome_use',
      title: 'Secure Browser Agent Regular Chrome Use',
      description: 'Read-only plan for using the operator everyday Chrome safely: Chrome MCP existing-tab lane when proved, otherwise gated extension resume without direct default-profile CDP.',
      inputSchema: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'] },
          statusText: { type: 'string', description: 'Raw Chrome MCP status output to parse into connection flags.' },
          listPagesText: { type: 'string', description: 'Raw Chrome MCP list_pages output to parse into page-list readiness flags.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpTools: { type: 'number' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          chromeMcpLastError: { type: 'string' },
          chromeMcpSource: { type: 'string' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Allow a connected MCP backend to return a background new_page template without listing existing tabs.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL for a fresh background tab; the value is never read by this tool.' },
          chromeExtensionPrepared: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Codex Chrome Extension prerequisite readiness to avoid live helper probes.' },
          chromeExtensionBackendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Codex Chrome Extension backend availability.' },
          chromeExtensionBackendLastError: { type: 'string', description: 'Optional observed Codex Chrome Extension backend error, for example Transport closed.' },
          chromeExtensionWindowRetryAttempted: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Set yes after opening the selected Chrome profile window and retrying the extension backend once.' },
          appleEventsActiveTabObserved: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Chrome Apple Events active-tab metadata availability.' },
          appleEventsJavascriptAllowed: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Chrome Apple Events JavaScript permission state.' },
          pluginDir: { type: 'string' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_regular_chrome_refresh',
      title: 'Secure Browser Agent Regular Chrome Refresh',
      description: 'Refreshes the low-token everyday-Chrome decision by running the safe Apple Events metadata diagnostic and writing both status files under runs/.',
      inputSchema: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'] },
          appleEventsOut: { type: 'string', description: 'runs/-relative output path for Chrome Apple Events status.' },
          out: { type: 'string', description: 'runs/-relative output path for the regular Chrome use decision.' },
          statusText: { type: 'string', description: 'Optional raw Chrome MCP status output to parse into connection flags.' },
          listPagesText: { type: 'string', description: 'Optional raw Chrome MCP list_pages output to parse into page-list readiness flags.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpTools: { type: 'number' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          chromeMcpLastError: { type: 'string' },
          chromeMcpSource: { type: 'string' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve the operator opt-in for a fresh everyday-Chrome background tab.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name for the operator-provided background tab URL; the value is never read.' },
          chromeExtensionPrepared: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeExtensionBackendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeExtensionBackendLastError: { type: 'string' },
          chromeExtensionWindowRetryAttempted: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          pluginDir: { type: 'string' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_regular_chrome_status',
      title: 'Secure Browser Agent Regular Chrome Status',
      description: 'Reads the saved everyday-Chrome decision under runs/ without touching Chrome or browser storage.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved regular Chrome use decision.' },
          appleEventsIn: { type: 'string', description: 'runs/-relative saved Apple Events status.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve the operator opt-in in generated refresh/watch commands.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name for the operator-provided background tab URL; the value is never read.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_regular_chrome_watch',
      title: 'Secure Browser Agent Regular Chrome Watch',
      description: 'Plans or runs one guarded refresh step for saved everyday-Chrome readiness when the saved status is missing, stale, or broken.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          force: { type: 'boolean' },
          in: { type: 'string', description: 'runs/-relative saved regular Chrome use decision.' },
          appleEventsIn: { type: 'string', description: 'runs/-relative saved Apple Events status.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve the operator opt-in when a guarded refresh is needed.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name for the operator-provided background tab URL; the value is never read.' },
          staleAfterSeconds: { type: 'number' },
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'] },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_apple_events_status',
      title: 'Secure Browser Agent Chrome Apple Events Status',
      description: 'Read-only diagnostic for macOS Google Chrome Apple Events: active-tab URL/title metadata availability and JavaScript-from-Apple-Events permission without returning title text or full URLs.',
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
      name: 'sba_chrome_apple_events_enable_plan',
      title: 'Secure Browser Agent Chrome Apple Events Enable Plan',
      description: 'Read-only plan for enabling Chrome JavaScript from Apple Events and rechecking the active-tab outline lane. Does not change Chrome settings or open Chrome.',
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
      name: 'sba_chrome_apple_events_outline',
      title: 'Secure Browser Agent Chrome Apple Events Outline',
      description: 'Operator-gated active-tab page structure outline through macOS Chrome Apple Events. Requires run=true and operatorOk=OK before executing JavaScript; returns counts and redacted URL metadata, not page text.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Execute the outline probe only when true.' },
          operatorOk: { type: 'string', description: 'Must be OK when run is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_browser_route',
      title: 'Secure Browser Agent Browser Route',
      description: 'Read-only routing decision for search, analysis, scrape, operate, existing Chrome tabs, public crawl acceleration, or Selenium compatibility work.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', enum: ['auto', 'search', 'analyze', 'scrape', 'operate', 'existing-tab', 'authenticated-scrape', 'public-crawl', 'compatibility-test'] },
          lane: { type: 'string', enum: ['auto', 'target-pack', 'regular-chrome', 'codex-browser-agent'] },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional externally observed Chrome DevTools MCP status for everyday Chrome existing-tab routing.' },
          chromeMcpTools: { type: 'number', description: 'Optional externally observed Chrome DevTools MCP tool count.' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether list_pages has succeeded for this MCP connection.' },
          chromeMcpPageCount: { type: 'number', description: 'Optional page count from a successful list_pages observation.' },
          chromeMcpLastError: { type: 'string', description: 'Short error text from the latest list_pages attempt, if any.' },
          chromeMcpSource: { type: 'string', description: 'Short source label for the observed Chrome MCP status.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Allow a connected MCP backend to route to a fresh background new_page template without listing existing tabs.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name for the operator-provided background tab URL; the value is never read.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_extension_status',
      title: 'Secure Browser Agent Codex Chrome Extension Status',
      description: 'Read-only status for controlling the user everyday Chrome through the Codex Chrome Extension: Chrome running, selected profile extension state, native host state, and safe next action.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginDir: { type: 'string', description: 'Optional Codex Chrome plugin directory override.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_extension_handoff',
      title: 'Secure Browser Agent Codex Chrome Extension Handoff',
      description: 'Read-only operator handoff for everyday Chrome control: current extension readiness, user permission requirement, and the exact open-selected-profile command to run only after approval.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginDir: { type: 'string', description: 'Optional Codex Chrome plugin directory override.' },
          write: { type: 'boolean', description: 'Write the handoff JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative handoff path. Defaults to operator/chrome-extension-handoff.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_extension_resume',
      title: 'Secure Browser Agent Codex Chrome Extension Resume',
      description: 'Permission-gated everyday Chrome resume path. Plans by default; only opens the selected Chrome profile when run is true and operatorOk is exactly OK.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginDir: { type: 'string', description: 'Optional Codex Chrome plugin directory override.' },
          run: { type: 'boolean', description: 'Attempt the open-and-refresh flow only with operatorOk exactly OK.' },
          operatorOk: { type: 'string', description: 'Must be exactly OK to open the selected everyday Chrome profile.' },
          dryRun: { type: 'boolean', description: 'Exercise the approved path without opening Chrome.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_extension_troubleshoot',
      title: 'Secure Browser Agent Codex Chrome Extension Troubleshoot',
      description: 'Read-only diagnostic for Codex Chrome Extension backend failures: classifies the observed backend error and returns gated retry commands without opening Chrome or reading browser storage.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginDir: { type: 'string', description: 'Optional Codex Chrome plugin directory override.' },
          backendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Observed extension backend availability from a live Chrome plugin check.' },
          backendLastError: { type: 'string', description: 'Short backend error text such as Browser is not available: extension.' },
          profileWindowRetryAttempted: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether the selected Chrome profile window was already opened and the backend probe still failed.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_extension_backend_check_plan',
      title: 'Secure Browser Agent Codex Chrome Extension Backend Check Plan',
      description: 'Read-only plan for probing the Codex Chrome Extension backend through node_repl openTabs(), then routing success to claim-plan or failure to troubleshoot without opening Chrome or reading browser storage.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginDir: { type: 'string', description: 'Optional Codex Chrome plugin directory override.' },
          backendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional previously observed extension backend availability.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_extension_claim_plan',
      title: 'Secure Browser Agent Codex Chrome Extension Claim Plan',
      description: 'Read-only plan for listing and claiming an existing user Chrome tab through the Codex Chrome Extension backend. Compact output stays low-token; structured content includes guarded node_repl snippets.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginDir: { type: 'string', description: 'Optional Codex Chrome plugin directory override.' },
          backendReady: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether the Codex Chrome Extension backend has already been proved available.' },
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'] },
          matchTitle: { type: 'string', description: 'Optional substring for selecting one of the tabs returned by openTabs().' },
          matchUrl: { type: 'string', description: 'Optional URL substring for selecting one of the tabs returned by openTabs().' },
          matchOrigin: { type: 'string', description: 'Optional exact redacted origin from openTabs safe metadata, preferred over raw URL matching.' },
          matchPath: { type: 'string', description: 'Optional exact redacted path from openTabs safe metadata, preferred over raw URL matching.' },
          tabIndex: { type: 'number', description: 'Optional index from the current openTabs() result.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_profile_status',
      title: 'Secure Browser Agent Profile Status',
      description: 'Read dedicated browser profile metadata without reading cookie values or secrets.',
      inputSchema: {
        type: 'object',
        properties: {
          profile: { type: 'string', description: 'Profile name. Defaults to policy default profile.' },
          policy: { type: 'string', description: 'Optional policy JSON path.' }
        }
      }
    },
    {
      name: 'sba_target_status',
      title: 'Secure Browser Agent Target Status',
      description: 'Inspect a target pack and its dedicated profile metadata.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          profile: { type: 'string' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_audit',
      title: 'Secure Browser Agent Target Audit',
      description: 'Audit a target pack before authenticated automation: policy scope, profile metadata, permissions, daemon/autostart state, and config secret scan.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          profile: { type: 'string' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_runtime_audit',
      title: 'Secure Browser Agent Runtime Audit',
      description: 'Read-only audit of local browser-agent runtime state: Peekaboo/MCP duplicates, agent-browser sessions, Chrome DevTools browser, and cleanup command suggestions.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write JSON runtime audit under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to runtime/runtime-audit.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_runtime_cleanup_plan',
      title: 'Secure Browser Agent Runtime Cleanup Plan',
      description: 'Read-only cleanup plan that groups duplicate MCP children by parent Codex/Claude session and lists safe manual review steps before any destructive action.',
      inputSchema: {
        type: 'object',
        properties: {
          ownerLimit: { type: 'number', description: 'Maximum parent sessions to list for manual review.' },
          write: { type: 'boolean', description: 'Write JSON runtime cleanup plan under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to runtime/runtime-cleanup-plan.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_run_gate_audit',
      title: 'Secure Browser Agent Run Gate Audit',
      description: 'Read-only inventory of CLI/MCP run-capable surfaces, separating agent-safe monitor commands, operator-ok gated wrappers, and direct operator-only browser/capture commands.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_compact_command_audit',
      title: 'Secure Browser Agent Compact Command Audit',
      description: 'Read-only audit of compact handoff command lines, checking that browser/capture/background commands have adjacent risk and operator/unattended flags.',
      inputSchema: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            enum: [...COMPACT_COMMAND_AUDIT_SOURCES, 'all'],
            description: 'Compact handoff source to audit. Defaults to operator-pack.'
          },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed before auditing operator-pack.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed before auditing operator-pack.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_completion_proof_bundle',
      title: 'Secure Browser Agent Completion Proof Bundle',
      description: 'Read-only one-shot bundle of readiness, strict objective completion, proof-gate, target approval preflight, and target proof plan state.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Approved real-external proof candidate. Defaults to github.' },
          includeCompactCommandAudit: { type: 'boolean', description: 'Also run compact-command-audit --source all while building the bundle. Defaults to false to keep the status bundle fast.' },
          write: { type: 'boolean', description: 'Write the bundle JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to operator/completion-proof-bundle-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_completion_proof_bundle_status',
      title: 'Secure Browser Agent Completion Proof Bundle Status',
      description: 'Read-only status for the saved completion proof bundle under runs/, including freshness and refresh command.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved bundle path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved bundle status.' },
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Fallback candidate for refresh command when no saved bundle exists.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_completion_proof_bundle_watch',
      title: 'Secure Browser Agent Completion Proof Bundle Watch',
      description: 'Executable safe watcher that refreshes the saved completion proof bundle only when it is missing, stale, or parse-broken. It never opens Chrome or starts capture.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Actually refresh when the saved bundle is missing, stale, or parse-broken.' },
          in: { type: 'string', description: 'runs/-relative saved bundle path.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to the input path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved bundle status.' },
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Fallback candidate for refresh command when no saved bundle exists.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_source_audit',
      title: 'Secure Browser Agent Source Audit',
      description: 'Inventory local reference clones and installed provider signals used to justify browser backend choices.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_browser_doctor',
      title: 'Secure Browser Agent agent-browser Doctor',
      description: 'Read-only agent-browser readiness check: CLI availability, Chrome for Testing cache, safe install plan, and provider follow-up commands.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_lightpanda_doctor',
      title: 'Secure Browser Agent Lightpanda Doctor',
      description: 'Read-only Lightpanda readiness check: configured binary, local source clone, build tools, telemetry posture, install plan, and benchmark command.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_provider_doctor_status',
      title: 'Secure Browser Agent Provider Doctor Status',
      description: 'Read-only compact rollup of provider recommendation, Lightpanda doctor, Playwright doctor, and Selenium doctor for low-token backend health checks.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_playwright_doctor',
      title: 'Secure Browser Agent Playwright Doctor',
      description: 'Read-only Playwright readiness check: playwright-core package, Chrome for Testing cache, storageState boundary, install plan, and public smoke command.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_lightpanda_decision',
      title: 'Secure Browser Agent Lightpanda Decision',
      description: 'Write or preview a secret-free Lightpanda public-crawl adopt/reject decision from doctor evidence.',
      inputSchema: {
        type: 'object',
        properties: {
          decision: { type: 'string', enum: ['reject', 'adopt'] },
          reason: { type: 'string' },
          write: { type: 'boolean', description: 'Write JSON decision proof under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to provider-benchmarks/lightpanda-decision.json when write is true.' },
          force: { type: 'boolean', description: 'Allow adopt without a benchmark-ready executable. Prefer benchmark proof instead.' }
        }
      }
    }
  ];
}
