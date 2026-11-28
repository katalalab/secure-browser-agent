#!/usr/bin/env node
import { assertEngineAllowed, loadPolicy } from './policy.mjs';
import { NOT_HANDLED, parseArgs } from './cli-support.mjs';
import { printHelp } from './cli-help.mjs';
import { runCommandsPart1 } from './cli-commands-1.mjs';
import { runCommandsPart2 } from './cli-commands-2.mjs';
import { runCommandsPart3 } from './cli-commands-3.mjs';

const COMMAND_PARTS = [runCommandsPart1, runCommandsPart2, runCommandsPart3];

async function main() {
  const { command, flags, positional } = parseArgs(process.argv.slice(2));
  const policy = loadPolicy(flags.policy);
  const profileName = flags.profile || policy.defaultProfile || 'default';
  const engine = flags.engine || policy.defaultEngine || 'chrome';

  if (!command || command === 'help') {
    printHelp();
    return;
  }

  assertEngineAllowed(engine, profileName, policy);
  const outputMetadata = {
    command,
    profile: profileName,
    engine,
    argv: process.argv.slice(2)
  };

  const context = { command, flags, positional, policy, profileName, engine, outputMetadata };
  for (const runCommandsPart of COMMAND_PARTS) {
    if ((await runCommandsPart(context)) !== NOT_HANDLED) return;
  }

  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
