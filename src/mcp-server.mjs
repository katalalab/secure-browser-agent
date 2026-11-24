import readline from 'node:readline';
import { NOT_HANDLED, canUseReadOnlyMcpCache } from './mcp-support.mjs';
import { listMcpToolsPart1 } from './mcp-tools-1.mjs';
import { listMcpToolsPart2 } from './mcp-tools-2.mjs';
import { callMcpToolPart1 } from './mcp-calls-1.mjs';
import { callMcpToolPart2 } from './mcp-calls-2.mjs';

const TOOL_CALL_PARTS = [callMcpToolPart1, callMcpToolPart2];

export const MCP_PROTOCOL_VERSION = '2025-06-18';

export function listMcpTools() {
  return [...listMcpToolsPart1(), ...listMcpToolsPart2()];
}

export async function callMcpTool(name, args = {}) {
  // Allow tests to override rootDir via env; production uses cwd to prevent test remnants polluting repo
  const rootDir = process.env.SBA_ROOT_DIR || process.cwd();
  const useCache = canUseReadOnlyMcpCache(args);
  const context = { name, args, rootDir, useCache };
  for (const callPart of TOOL_CALL_PARTS) {
    const result = await callPart(context);
    if (result !== NOT_HANDLED) return result;
  }

  throw new Error(`Unknown tool: ${name}`);
}

function success(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function failure(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

export async function handleMcpMessage(message) {
  if (!message || message.jsonrpc !== '2.0') return failure(message?.id ?? null, -32600, 'Invalid Request');
  if (!Object.hasOwn(message, 'id')) {
    if (message.method === 'notifications/initialized') return null;
    return null;
  }
  try {
    if (message.method === 'initialize') {
      return success(message.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: 'secure-browser-agent',
          title: 'Secure Browser Agent',
          version: '0.1.0'
        },
        instructions: 'Use target-pack tools for authenticated browser operation. Credentials remain in dedicated Chrome profiles; tool outputs are redacted by policy.'
      });
    }
    if (message.method === 'ping') return success(message.id, {});
    if (message.method === 'tools/list') return success(message.id, { tools: listMcpTools() });
    if (message.method === 'tools/call') {
      const params = message.params || {};
      if (!params.name) return failure(message.id, -32602, 'tools/call requires params.name');
      return success(message.id, await callMcpTool(params.name, params.arguments || {}));
    }
    return failure(message.id, -32601, `Method not found: ${message.method}`);
  } catch (error) {
    return failure(message.id, -32000, error.message);
  }
}

export async function runMcpStdio({ input = process.stdin, output = process.stdout, error = process.stderr } = {}) {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch (parseError) {
      output.write(`${JSON.stringify(failure(null, -32700, 'Parse error', parseError.message))}\n`);
      continue;
    }
    const response = await handleMcpMessage(message);
    if (response) output.write(`${JSON.stringify(response)}\n`);
  }
  error.write('');
}
