// Command handlers 2339-3311 of the former src/cli.mjs main(); src/cli.mjs runs the parts in order until one handles the command.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionWithCdp, analyzeWithCdp, cdpDaemonStatus, consoleSummaryWithCdp, extractWithCdp, inspectWithCdp, networkSummaryWithCdp, observeWithCdp, openCdpProfile, outlineWithCdp, runRecipeWithCdp, scrapeWithCdp, screenshotWithCdp, startCdpDaemon, stopCdpDaemon, waitForWithCdp } from './cdp-backend.mjs';
import { runAgentBrowser, sessionArgs } from './agent-browser.mjs';
import { summarizeHarFile } from './har.mjs';
import { outlineWithPlaywright } from './playwright-adapter.mjs';
import { assertAllowedUrl, assertEngineAllowed, loadPolicy, profilePath, redact, statePath } from './policy.mjs';
import { applyOwnedReap, planOwnedReap } from './reap-owned.mjs';
import { buildExtractScript, buildObserveScript, buildOutlineScript } from './extract-script.mjs';
import { safeOutputPath, writeOutput } from './output.mjs';
import { addTargetOperateStep, addTargetUrls, applyTargetPermissions, buildTargetRunStatus, formatTargetRunStatusCompact, loadTargetAutostart, removeTargetAutostart, resolveTargetAutostart, resolveTargetDaemon, resolveTargetLogin, resolveTargetPack, resolveTargetPermissions, resolveTargetRun, resolveTargetScrape, targetAutostartStatus, targetLoginHandoff, targetPermissionStatus, unloadTargetAutostart, writeTargetAutostart, writeTargetPermissions } from './target-pack.mjs';
import { profileStatus } from './profile-status.mjs';
import { buildTargetBatch, formatTargetBatchCompact, formatTargetBatchMarkdown } from './target-batch.mjs';
import { buildTargetProof, buildTargetProofInventory, buildTargetProofNext, buildTargetProofPlan, formatTargetProofInventoryCompact, formatTargetProofInventoryMarkdown, formatTargetProofMarkdown, formatTargetProofNextCompact, formatTargetProofNextMarkdown, formatTargetProofPlanCompact, formatTargetProofPlanMarkdown } from './target-proof.mjs';
import { buildTargetProofCapture, formatTargetProofCaptureCompact, formatTargetProofCaptureMarkdown } from './target-proof-capture.mjs';
import { buildTargetLoginCapture, formatTargetLoginCaptureMarkdown } from './target-login-capture.mjs';
import { buildTargetHandoffResume, buildTargetHandoffResumeStatus, buildTargetHandoffResumeWatch, buildTargetHandoffRun, buildTargetHandoffStatus, formatTargetHandoffResumeCompact, formatTargetHandoffResumeMarkdown, formatTargetHandoffResumeStatusCompact, formatTargetHandoffResumeWatchCompact, formatTargetHandoffRunCompact, formatTargetHandoffRunMarkdown, formatTargetHandoffStatusCompact, formatTargetHandoffStatusMarkdown } from './target-handoff-run.mjs';
import { buildTargetAuthCheck, buildTargetAuthWatch, formatTargetAuthCheckCompact, formatTargetAuthCheckMarkdown, formatTargetAuthWatchCompact, formatTargetAuthWatchMarkdown } from './target-auth-check.mjs';
import { buildTargetCandidatePlan, buildTargetCandidatePlanStatus, buildTargetCandidatePlanWatch, formatTargetCandidatePlanCompact, formatTargetCandidatePlanMarkdown, formatTargetCandidatePlanStatusCompact, formatTargetCandidatePlanWatchCompact, writeTargetCandidatePlan } from './target-candidate-plan.mjs';
import { buildTargetApprovalPack, buildTargetApprovalPreflight, buildTargetApprovalResume, buildTargetApprovalResumeStatus, buildTargetApprovalResumeWatch, buildTargetApprovalStatus, formatTargetApprovalPackCompact, formatTargetApprovalPackMarkdown, formatTargetApprovalPreflightCompact, formatTargetApprovalResumeCompact, formatTargetApprovalResumeStatusCompact, formatTargetApprovalResumeWatchCompact, formatTargetApprovalStatusCompact, writeTargetApprovalPack } from './target-approval-pack.mjs';
import { toPosixPath } from './output.mjs';
import { NOT_HANDLED, assertRecipeAllowed, ensureDirs, expandRecipeSearchSteps, isDataUrl, printJson, readJsonFile, searchStatus, searchUrl } from './cli-support.mjs';

export async function runCommandsPart3({ command, flags, positional, policy, profileName, engine, outputMetadata }) {
if (command === 'target-candidate-plan') {
    const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
    const result = buildTargetCandidatePlan({
      rootDir,
      candidate: flags.candidate || positional[0]
    });
    if (flags.write || flags.out || flags.output) {
      writeTargetCandidatePlan(rootDir, result, flags.out || flags.output);
    }
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetCandidatePlanCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetCandidatePlanMarkdown(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-candidate-plan-status') {
    const result = buildTargetCandidatePlanStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input,
      staleAfterSeconds: flags['stale-after-seconds']
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetCandidatePlanStatusCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-candidate-plan-watch') {
    const result = buildTargetCandidatePlanWatch({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      in: flags.in || flags.input,
      out: flags.out || flags.output,
      staleAfterSeconds: flags['stale-after-seconds'],
      candidate: flags.candidate || positional[0]
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetCandidatePlanWatchCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-approval-pack') {
    const result = buildTargetApprovalPack({
      ...flags,
      candidate: flags.candidate || positional[0],
      rootDir: process.cwd()
    });
    if (flags.write || flags.out) {
      result.outputPath = writeTargetApprovalPack(process.cwd(), result, flags.out || '');
    }
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetApprovalPackCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetApprovalPackMarkdown(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-approval-status') {
    const result = await buildTargetApprovalStatus({
      ...flags,
      candidate: flags.candidate || positional[0],
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetApprovalStatusCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-approval-preflight') {
    const result = await buildTargetApprovalPreflight({
      ...flags,
      candidate: flags.candidate || positional[0],
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetApprovalPreflightCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-approval-resume') {
    const result = await buildTargetApprovalResume({
      ...flags,
      candidate: flags.candidate || positional[0],
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetApprovalResumeCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-approval-resume-status') {
    const result = buildTargetApprovalResumeStatus({
      ...flags,
      candidate: flags.candidate || positional[0],
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetApprovalResumeStatusCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-approval-resume-watch') {
    const result = await buildTargetApprovalResumeWatch({
      ...flags,
      candidate: flags.candidate || positional[0],
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetApprovalResumeWatchCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-auth-check') {
    const result = await buildTargetAuthCheck(positional[0], {
      ...flags,
      write: Boolean(flags.write),
      daemon: Boolean(flags.daemon)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetAuthCheckCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetAuthCheckMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && !result.ok) process.exitCode = 1;
    return;
  }

  if (command === 'target-auth-watch') {
    const result = await buildTargetAuthWatch(positional[0], {
      ...flags,
      daemon: Boolean(flags.daemon)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetAuthWatchCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetAuthWatchMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && !result.ok) process.exitCode = 1;
    return;
  }

  if (command === 'target-proof-inventory') {
    const result = await buildTargetProofInventory(path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))), {
      ...flags,
      realExternal: Boolean(flags['real-external'])
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetProofInventoryCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetProofInventoryMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && !result.complete) process.exitCode = 1;
    return;
  }

  if (command === 'target-proof-next') {
    const result = await buildTargetProofNext(path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))), {
      ...flags,
      realExternal: Boolean(flags['real-external'])
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetProofNextCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetProofNextMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && !result.complete) process.exitCode = 1;
    return;
  }

  if (command === 'target-proof-plan') {
    const result = await buildTargetProofPlan(positional[0], {
      ...flags,
      realExternal: Boolean(flags['real-external']),
      benchmarkFile: flags['benchmark-file']
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetProofPlanCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetProofPlanMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && !result.currentState.proofReady) process.exitCode = 1;
    return;
  }

  if (command === 'target-proof-capture') {
    const result = await buildTargetProofCapture(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      realExternal: Boolean(flags['real-external']),
      benchmarkFile: flags['benchmark-file'],
      applyPermissions: Boolean(flags['apply-permissions']),
      startDaemon: flags['start-daemon'] !== false,
      stopDaemon: Boolean(flags['stop-daemon']),
      cleanupOnFailure: flags['no-cleanup-on-failure'] !== true,
      run: Boolean(flags.run)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetProofCaptureCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetProofCaptureMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && result.status !== 'completed') process.exitCode = 1;
    return;
  }

  if (command === 'target-batch') {
    const result = await buildTargetBatch(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      realExternal: Boolean(flags['real-external']),
      run: Boolean(flags.run)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetBatchCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetBatchMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && result.status !== 'completed') process.exitCode = 1;
    return;
  }

  if (command === 'target-proof') {
    const result = await buildTargetProof(positional[0], {
      ...flags,
      realExternal: Boolean(flags['real-external']),
      requireBenchmark: Boolean(flags['require-benchmark']),
      benchmarkFile: flags['benchmark-file']
    });
    if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetProofMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && !result.ok) process.exitCode = 1;
    return;
  }

  if (command === 'target-info') {
    const target = resolveTargetPack(positional[0]);
    printJson({
      dir: target.dir,
      policy: target.policy,
      metadata: target.metadataFile,
      target: target.metadata
    });
    return;
  }

  if (command === 'target-status') {
    const target = resolveTargetPack(positional[0]);
    const targetPolicy = loadPolicy(target.policy);
    const targetProfile = flags.profile || target.metadata.profile || target.targetPolicy.defaultProfile || target.metadata.target;
    printJson({
      target: target.metadata.target || targetProfile,
      dir: target.dir,
      ...profileStatus(targetPolicy, targetProfile)
    });
    return;
  }

  if (command === 'target-add-url') {
    printJson(addTargetUrls(positional[0], positional.slice(1), { dryRun: Boolean(flags['dry-run']) }));
    return;
  }

  if (command === 'target-operate-add') {
    printJson(addTargetOperateStep(positional[0], positional[1], {
      ...flags,
      dryRun: Boolean(flags['dry-run']),
      valueEnv: flags['value-env'],
      urlIncludes: flags['url-includes'],
      afterMs: flags['after-ms'],
      timeoutMs: flags['timeout-ms'],
      pollMs: flags['poll-ms'],
      linkLimit: flags['link-limit'],
      controlLimit: flags['control-limit'],
      textLimit: flags['text-limit'],
      candidateLimit: flags['candidate-limit'],
      sampleLimit: flags['sample-limit']
    }));
    return;
  }

  if (command === 'target-login') {
    const target = resolveTargetLogin(positional[0], flags);
    const handoff = targetLoginHandoff(target.dir, { realExternal: Boolean(flags['real-external']) });
    const targetPolicy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, targetPolicy);
    assertAllowedUrl(target.loginUrl, targetPolicy);
    ensureDirs(targetPolicy, target.profile);
    if (flags['dry-run']) {
      printJson({ ...target, handoff });
      return;
    }
    const output = await openCdpProfile(target.loginUrl, profilePath(targetPolicy, target.profile), { headed: true });
    printJson({
      ...output,
      target: target.target,
      profile: target.profile,
      policy: target.policy,
      next: handoff.instructions.join(' '),
      handoff
    });
    return;
  }

  if (command === 'target-login-capture') {
    const result = await buildTargetLoginCapture(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      realExternal: Boolean(flags['real-external'])
    });
    if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetLoginCaptureMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && result.status !== 'completed') process.exitCode = 1;
    return;
  }

  if (command === 'target-handoff-run') {
    const result = await buildTargetHandoffRun(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      commandId: flags.command,
      run: Boolean(flags.run),
      preflightAuth: flags['no-preflight-auth'] !== true
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetHandoffRunCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetHandoffRunMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && result.status !== 'completed') process.exitCode = 1;
    return;
  }

  if (command === 'target-handoff-status') {
    const result = buildTargetHandoffStatus(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetHandoffStatusCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetHandoffStatusMarkdown(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-handoff-resume') {
    const result = await buildTargetHandoffResume(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetHandoffResumeCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetHandoffResumeMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && result.status !== 'completed') process.exitCode = 1;
    return;
  }

  if (command === 'target-handoff-resume-status') {
    const result = buildTargetHandoffResumeStatus(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetHandoffResumeStatusCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-handoff-resume-watch') {
    const result = await buildTargetHandoffResumeWatch(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      operatorOk: flags['operator-ok'] || flags.operatorOk,
      run: Boolean(flags.run)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetHandoffResumeWatchCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-permissions') {
    const target = resolveTargetPermissions(positional[0], positional[1] || 'status', flags);
    const targetPolicy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, targetPolicy);
    const targetProfilePath = profilePath(targetPolicy, target.profile);
    if (target.action === 'set') {
      printJson(writeTargetPermissions(target));
    } else if (target.action === 'apply') {
      const daemon = await cdpDaemonStatus(targetProfilePath);
      if (daemon.ok && !flags.force) {
        throw new Error(`target profile daemon is running; stop it before applying permissions or pass --force: ${target.profile}`);
      }
      ensureDirs(targetPolicy, target.profile);
      printJson(applyTargetPermissions(target, targetProfilePath));
    } else if (target.action === 'status') {
      printJson(targetPermissionStatus(target, targetProfilePath));
    } else {
      printJson(target);
    }
    return;
  }

  if (command === 'target-daemon') {
    const target = resolveTargetDaemon(positional[0], positional[1] || 'status', flags);
    const targetPolicy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, targetPolicy);
    const daemonProfilePath = profilePath(targetPolicy, target.profile);
    let output;
    if (target.action === 'start') {
      if (target.initialUrl !== 'about:blank') assertAllowedUrl(target.initialUrl, targetPolicy);
      ensureDirs(targetPolicy, target.profile);
      output = await startCdpDaemon(daemonProfilePath, {
        headed: Boolean(flags.headed),
        initialUrl: target.initialUrl
      });
    } else if (target.action === 'stop') {
      output = await stopCdpDaemon(daemonProfilePath);
    } else {
      output = await cdpDaemonStatus(daemonProfilePath);
    }
    printJson({
      target: target.target,
      action: target.action,
      profile: target.profile,
      policy: target.policy,
      ...output
    });
    return;
  }

  if (command === 'target-autostart') {
    const target = resolveTargetAutostart(positional[0], positional[1] || 'plan', {
      ...flags,
      installPath: flags['install-path'],
      nodePath: process.execPath,
      cliPath: fileURLToPath(import.meta.url)
    });
    const targetPolicy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, targetPolicy);
    if (target.initialUrl !== 'about:blank') assertAllowedUrl(target.initialUrl, targetPolicy);
    if (target.action === 'write' || target.action === 'install') {
      printJson(writeTargetAutostart(target));
    } else if (target.action === 'load') {
      printJson(loadTargetAutostart(target));
    } else if (target.action === 'unload') {
      printJson(unloadTargetAutostart(target));
    } else if (target.action === 'remove') {
      printJson(removeTargetAutostart(target));
    } else if (target.action === 'status') {
      printJson(targetAutostartStatus(target));
    } else {
      printJson(target);
    }
    return;
  }

  if (command === 'target-run') {
    const target = resolveTargetRun(positional[0], positional[1] || 'outline', flags);
    const targetPolicy = loadPolicy(target.policy);
    assertEngineAllowed(engine, target.profile, targetPolicy);
    ensureDirs(targetPolicy, target.profile);
    const recipe = expandRecipeSearchSteps(readJsonFile(target.recipe));
    assertRecipeAllowed(recipe, targetPolicy);
    const output = await runRecipeWithCdp(recipe, profilePath(targetPolicy, target.profile), {
      daemon: Boolean(flags.daemon),
      afterActionMs: Number(flags['after-action-ms'] || 100),
      allowedOrigins: targetPolicy.allowedOrigins || [],
      artifactDir: targetPolicy.outputDir,
      artifactManifest: flags.manifest !== false,
      artifactPolicy: targetPolicy.source
    });
    writeOutput(targetPolicy, {
      ...flags,
      out: target.out,
      format: target.format,
      result: target.result,
      manifest: flags.manifest !== false
    }, redact(output, targetPolicy), {
      command,
      profile: target.profile,
      engine,
      argv: process.argv.slice(2),
      targetDir: target.dir,
      recipe: target.recipe,
      recipeName: target.recipeName
    });
    return;
  }

  if (command === 'target-run-status') {
    const status = buildTargetRunStatus(positional[0], positional[1] || 'outline', {
      ...flags,
      staleAfterSeconds: flags['stale-after-seconds']
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetRunStatusCompact(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'target-scrape') {
    const target = resolveTargetScrape(positional[0], flags);
    const targetPolicy = loadPolicy(target.policy);
    assertEngineAllowed(engine, target.profile, targetPolicy);
    assertAllowedUrl(target.url, targetPolicy);
    ensureDirs(targetPolicy, target.profile);
    const output = await scrapeWithCdp(target.url, profilePath(targetPolicy, target.profile), {
      daemon: Boolean(flags.daemon),
      selector: flags.selector || '',
      suggestion: flags.suggestion ?? 0,
      fields: flags.fields ? String(flags.fields).split(',') : [],
      limit: Number(flags.limit || 50),
      waitMs: Number(flags['wait-ms'] || 300),
      linkLimit: Number(flags['link-limit'] || 25),
      controlLimit: Number(flags['control-limit'] || 40),
      textLimit: Number(flags['text-limit'] || 600),
      candidateLimit: Number(flags['candidate-limit'] || 20),
      sampleLimit: Number(flags['sample-limit'] || 3),
      suggestionLimit: Number(flags['suggestion-limit'] || 8),
      consoleLimit: Number(flags['console-limit'] || 100),
      maxConsoleArgLength: Number(flags['max-console-arg-length'] || 300)
    });
    writeOutput(targetPolicy, {
      ...flags,
      out: target.out,
      format: target.format,
      result: target.result,
      manifest: flags.manifest !== false
    }, redact(output, targetPolicy), {
      command,
      profile: target.profile,
      engine,
      argv: process.argv.slice(2),
      targetDir: target.dir,
      target: target.target,
      url: target.url,
      selector: output.extractor.selector
    });
    return;
  }

  if (command === 'har-summary') {
    const harPath = positional[0];
    if (!harPath) throw new Error('har-summary requires a HAR path');
    writeOutput(policy, flags, summarizeHarFile(harPath, policy), outputMetadata);
    return;
  }

  if (command === 'reap-owned') {
    const plan = planOwnedReap(policy, { includePublic: flags.public !== false });
    if (!flags.apply) {
      printJson({ mode: 'dry-run', ...plan });
      return;
    }
    printJson({ mode: 'apply', ...applyOwnedReap(plan) });
    return;
  }

  if (command === 'close-session') {
    const result = await runAgentBrowser(['--session', profileName, 'close'], { timeoutMs: 5000 });
    process.stdout.write(result.stdout);
    return;
  }

  ensureDirs(policy, profileName);

  if (command === 'open') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const args = [...sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'], skipAllowedDomains: isDataUrl(url) })];
    if (flags.headed) args.push('--headed');
    args.push('open', url);
    const result = await runAgentBrowser(args);
    process.stdout.write(result.stdout);
    return;
  }

  if (command === 'login') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const args = [...sessionArgs(policy, profileName, { engine: 'chrome' }), '--headed', 'open', url];
    const result = await runAgentBrowser(args);
    process.stdout.write(result.stdout);
    printJson({
      profile: profileName,
      profilePath: profilePath(policy, profileName),
      statePath: statePath(policy, profileName),
      next: 'Complete login in the opened dedicated browser profile, then run snapshot or extract with the same --profile.'
    });
    return;
  }

  if (command === 'snapshot') {
    const args = [...sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'] }), 'snapshot', '-i'];
    if (flags.json) args.push('--json');
    const result = await runAgentBrowser(args);
    process.stdout.write(result.stdout);
    return;
  }

  if (command === 'extract') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const selector = flags.selector || 'body';
    const limit = Number(flags.limit || 50);
    const fields = String(flags.fields || 'text,href').split(',');
    const script = buildExtractScript({ selector, limit, fields });
    if (Buffer.byteLength(script, 'utf8') > policy.maxEvalBytes) {
      throw new Error(`extract script exceeds maxEvalBytes=${policy.maxEvalBytes}`);
    }
    const browserArgs = sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'], skipAllowedDomains: isDataUrl(url) });
    await runAgentBrowser([...browserArgs, 'open', url]);
    const result = await runAgentBrowser([...browserArgs, 'eval', '--stdin'], { stdin: script });
    try {
      writeOutput(policy, flags, redact(JSON.parse(result.stdout), policy), { ...outputMetadata, url, selector, fields, limit });
    } catch {
      process.stdout.write(result.stdout);
    }
    return;
  }

  if (command === 'outline') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const script = buildOutlineScript({ linkLimit: Number(flags['link-limit'] || 100) });
    const browserArgs = sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'], skipAllowedDomains: isDataUrl(url) });
    await runAgentBrowser([...browserArgs, 'open', url]);
    const result = await runAgentBrowser([...browserArgs, 'eval', '--stdin'], { stdin: script });
    try {
      writeOutput(policy, flags, redact(JSON.parse(result.stdout), policy), { ...outputMetadata, url });
    } catch {
      process.stdout.write(result.stdout);
    }
    return;
  }

  if (command === 'observe') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const script = buildObserveScript({
      linkLimit: Number(flags['link-limit'] || 25),
      controlLimit: Number(flags['control-limit'] || 40),
      textLimit: Number(flags['text-limit'] || 600)
    });
    const browserArgs = sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'], skipAllowedDomains: isDataUrl(url) });
    await runAgentBrowser([...browserArgs, 'open', url]);
    const result = await runAgentBrowser([...browserArgs, 'eval', '--stdin'], { stdin: script });
    try {
      writeOutput(policy, flags, redact(JSON.parse(result.stdout), policy), { ...outputMetadata, url });
    } catch {
      process.stdout.write(result.stdout);
    }
    return;
  }

  if (command === 'extract-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await extractWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      selector: flags.selector || 'body',
      limit: Number(flags.limit || 50),
      fields: String(flags.fields || 'text,href').split(',')
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url, selector: flags.selector || 'body' });
    return;
  }

  if (command === 'outline-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await outlineWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      linkLimit: Number(flags['link-limit'] || 100)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'observe-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await observeWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      linkLimit: Number(flags['link-limit'] || 25),
      controlLimit: Number(flags['control-limit'] || 40),
      textLimit: Number(flags['text-limit'] || 600)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'analyze-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await analyzeWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      waitMs: Number(flags['wait-ms'] || 300),
      linkLimit: Number(flags['link-limit'] || 25),
      controlLimit: Number(flags['control-limit'] || 40),
      textLimit: Number(flags['text-limit'] || 600),
      candidateLimit: Number(flags['candidate-limit'] || 20),
      sampleLimit: Number(flags['sample-limit'] || 3),
      suggestionLimit: Number(flags['suggestion-limit'] || 8),
      consoleLimit: Number(flags['console-limit'] || 100),
      maxConsoleArgLength: Number(flags['max-console-arg-length'] || 300)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'scrape-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await scrapeWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      selector: flags.selector || '',
      suggestion: flags.suggestion ?? 0,
      fields: flags.fields ? String(flags.fields).split(',') : [],
      limit: Number(flags.limit || 50),
      waitMs: Number(flags['wait-ms'] || 300),
      linkLimit: Number(flags['link-limit'] || 25),
      controlLimit: Number(flags['control-limit'] || 40),
      textLimit: Number(flags['text-limit'] || 600),
      candidateLimit: Number(flags['candidate-limit'] || 20),
      sampleLimit: Number(flags['sample-limit'] || 3),
      suggestionLimit: Number(flags['suggestion-limit'] || 8),
      consoleLimit: Number(flags['console-limit'] || 100),
      maxConsoleArgLength: Number(flags['max-console-arg-length'] || 300)
    });
    writeOutput(policy, { result: flags.result || 'rows', ...flags }, redact(output, policy), { ...outputMetadata, url, selector: output.extractor.selector });
    return;
  }

  if (command === 'inspect-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await inspectWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      candidateLimit: Number(flags['candidate-limit'] || 20),
      sampleLimit: Number(flags['sample-limit'] || 3)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'wait-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await waitForWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      selector: flags.selector || '',
      text: flags.text || '',
      urlIncludes: flags['url-includes'] || '',
      timeoutMs: Number(flags['timeout-ms'] || 5000),
      pollMs: Number(flags['poll-ms'] || 100)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'console-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await consoleSummaryWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      waitMs: Number(flags['wait-ms'] || 300),
      limit: Number(flags.limit || 100),
      maxArgLength: Number(flags['max-arg-length'] || 300)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'screenshot-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    if (!flags.out) throw new Error('screenshot-cdp requires --out file.png');
    const output = await screenshotWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      fullPage: Boolean(flags['full-page']),
      waitMs: Number(flags['wait-ms'] || 0)
    });
    const target = safeOutputPath(policy, flags.out);
    fs.mkdirSync(policy.outputDir, { recursive: true });
    fs.writeFileSync(target, Buffer.from(output.data, 'base64'));
    const metadata = {
      command,
      profile: profileName,
      engine,
      argv: process.argv.slice(2),
      url,
      output: toPosixPath(path.relative(policy.rootDir, target)),
      mimeType: output.mimeType,
      format: output.format,
      fullPage: output.fullPage,
      width: output.width,
      height: output.height,
      bytes: output.bytes,
      policy: policy.source,
      createdAt: new Date().toISOString()
    };
    if (flags.manifest) {
      fs.writeFileSync(`${target}.manifest.json`, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    }
    printJson(metadata);
    return;
  }

  if (command === 'fill-cdp' || command === 'click-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const selector = flags.selector;
    if (!selector) throw new Error(`${command} requires --selector`);
    const output = await actionWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      action: command === 'fill-cdp' ? 'fill' : 'click',
      selector,
      value: flags.value || '',
      linkLimit: Number(flags['link-limit'] || 100)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url, action: command === 'fill-cdp' ? 'fill' : 'click', selector });
    return;
  }

  if (command === 'network-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await networkSummaryWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'login-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await openCdpProfile(url, profilePath(policy, profileName), { headed: true });
    printJson({
      ...output,
      next: 'Complete login in the opened dedicated Chrome profile, then close that browser before using extract-cdp/outline-cdp with the same --profile.'
    });
    return;
  }

  if (command === 'search-cdp') {
    const query = positional.join(' ');
    const provider = flags.provider || 'duckduckgo';
    const url = searchUrl(provider, query);
    assertAllowedUrl(url, policy);
    const output = await outlineWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      linkLimit: Number(flags['link-limit'] || 50)
    });
    writeOutput(policy, flags, redact({
      search: searchStatus(provider, query, output),
      page: output
    }, policy), { ...outputMetadata, provider, query, url });
    return;
  }

  if (command === 'run-cdp') {
    const recipe = expandRecipeSearchSteps(readJsonFile(positional[0]));
    assertRecipeAllowed(recipe, policy);
    const output = await runRecipeWithCdp(recipe, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      afterActionMs: Number(flags['after-action-ms'] || 100),
      artifactDir: policy.outputDir,
      artifactManifest: Boolean(flags.manifest),
      artifactPolicy: policy.source
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, recipe: positional[0] });
    return;
  }

  if (command === 'outline-playwright') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await outlineWithPlaywright(url, { linkLimit: Number(flags['link-limit'] || 100) });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'capture-har') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const out = flags.out;
    if (!out) throw new Error('capture-har requires --out file.har');
    const harPath = safeOutputPath(policy, out);
    const harPathRelative = toPosixPath(path.relative(policy.rootDir, harPath));
    fs.mkdirSync(policy.outputDir, { recursive: true });
    const browserArgs = sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'], skipAllowedDomains: isDataUrl(url) });
    await runAgentBrowser([...browserArgs, 'network', 'har', 'start']);
    await runAgentBrowser([...browserArgs, 'open', url]);
    await runAgentBrowser([...browserArgs, 'network', 'har', 'stop', harPath]);
    process.stdout.write(`${harPath}\n`);
    return;
  }

  if (command === 'search') {
    const query = positional.join(' ');
    const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    assertAllowedUrl(url, policy);
    const result = await runAgentBrowser([...sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'], skipAllowedDomains: false }), 'open', url]);
    process.stdout.write(result.stdout);
    return;
  }

  return NOT_HANDLED;
}
