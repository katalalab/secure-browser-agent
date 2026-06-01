# Speed Systems Design

This document tracks the four speed systems behind GitHub issues #2, #3, #4, and #5.

## Objectives

- Reduce browser startup cost for repeated target-pack work.
- Reduce agent round trips and token-heavy status recomputation.
- Use faster engines only after benchmark proof.
- Preserve the existing safety model: dedicated target profiles for stored auth, ignored runtime artifacts, and compact outputs that do not echo page contents or secrets.

## System 1: Target Worker Pool

Issue: #2.

The worker pool is a target-pack daemon inventory and command surface. It is keyed by target pack and profile, then reports whether a reusable CDP daemon is already running.

Current implementation:

- `target-worker-pool --format compact`
- `target-worker-pool --target-dir runs/target-packs/name --format compact`

Design boundary:

- Status is read-only by default.
- Start/stop execution remains delegated to existing `target-daemon start|stop` commands.
- Pool metadata and target outputs remain under ignored `runs/`.

Next implementation checkpoint:

- Add bounded `--run --ensure` and idle reap support once the read-only status surface is stable.

## System 2: Status Cache

Issue: #3.

The status cache stores normalized JSON under `runs/cache/` with explicit TTL checks.

Current implementation:

- `status-cache --key provider-doctor-status --format compact`
- `status-cache --key backend-matrix --stale-after-seconds 900 --format compact`
- `status-cache --key control-status --write --format compact`

Design boundary:

- Cache values are generated only from known compact/status builders.
- Cache files stay under ignored `runs/cache/`.
- Cache output reports hit/miss/stale without raw page content.

Next implementation checkpoint:

- Wire high-traffic commands to prefer fresh cache automatically where their existing status commands already accept saved inputs.

## System 3: Lightpanda Public Gate

Issue: #4.

Lightpanda is only eligible for public crawl work after a local benchmark or explicit Lightpanda decision proof.

Current implementation:

- `lightpanda-gate --format compact`
- `browser-route --task public-crawl --format compact` reports the gate state.

Design boundary:

- Authenticated profiles remain Chrome-only.
- The gate accepts only summarized provider benchmark/decision proofs.
- No browser storage, cookies, or page bodies are read.

Next implementation checkpoint:

- Add a one-command public benchmark runner that writes the gate proof and immediately refreshes `browser-route`.

## System 4: Low-Token Target Batch

Issue: #5.

The target batch command plans or runs the common target-pack capture sequence through one compact surface.

Current implementation:

- `target-batch runs/target-packs/name --real-external --format compact`
- `target-batch runs/target-packs/name --real-external --run --wait-auth --format compact`

Design boundary:

- Plan mode does not open browsers or start capture.
- Run mode delegates to `target-proof-capture`, preserving existing real-external/auth gates.
- Compact output reports status, blockers, completed step count, and artifact paths only.

Next implementation checkpoint:

- Add resume/status watch support so agents can poll the batch artifact instead of every child command.
