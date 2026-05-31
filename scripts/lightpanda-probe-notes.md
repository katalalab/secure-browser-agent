# Lightpanda Probe

Use this after `npm run verify` when comparing the fast crawl backend.

```bash
cd ~/work/agent-tools/secure-browser-agent
npm run probe:lightpanda
```

Expected result if the local `agent-browser` Lightpanda engine is available:

- command exits 0
- output shape matches `probe:chrome`
- no authenticated profile is used; profile must be `public`

If it fails because the Lightpanda binary or engine support is missing, keep Chrome as the default backend and treat Lightpanda as pending installation/compatibility work.
