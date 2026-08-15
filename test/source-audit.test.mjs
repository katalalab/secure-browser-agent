import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSourceAudit, describeSourcePath, formatSourceAuditCompact, formatSourceAuditMarkdown } from '../src/source-audit.mjs';

function writeRepo(dir, packageJson) {
  fs.mkdirSync(path.join(dir, '.git', 'refs', 'heads'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
  fs.writeFileSync(path.join(dir, '.git', 'refs', 'heads', 'main'), '1234567890abcdef\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(packageJson), 'utf8');
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${packageJson.name}\n`, 'utf8');
}

test('source path description reads manifest and git metadata without executing git', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-source-path-'));
  writeRepo(dir, { name: 'sample-browser', version: '1.2.3' });
  const description = describeSourcePath(dir);
  assert.equal(description.exists, true);
  assert.equal(description.git.branch, 'main');
  assert.equal(description.git.commit, '1234567890ab');
  assert.equal(description.manifest.name, 'sample-browser');
  assert.equal(description.manifest.version, '1.2.3');
});

test('source audit inventories known local browser references and readiness signals', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-source-home-'));
  const rootDir = path.join(homeDir, 'work/agent-tools/secure-browser-agent');
  const agentBrowserDir = path.join(homeDir, 'src/agent-browser');
  const lightpandaDir = path.join(homeDir, 'src/lightpanda');
  writeRepo(rootDir, { name: 'secure-browser-agent', version: '0.1.0', private: true });
  writeRepo(agentBrowserDir, { name: 'agent-browser', version: '0.27.0' });
  fs.mkdirSync(lightpandaDir, { recursive: true });
  fs.writeFileSync(path.join(lightpandaDir, 'Cargo.toml'), '[package]\nname = "lightpanda"\nversion = "0.1.0"\n', 'utf8');

  const report = buildSourceAudit({
    rootDir,
    homeDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    env: { PATH: '' },
    clones: {
      'agent-browser': agentBrowserDir,
      'lightpanda-browser': lightpandaDir
    },
    status: {
      agentBrowser: { exists: true },
      chromeForTesting: { exists: true },
      secureBrowserAgentMcp: { exists: true },
      playwright: { coreExists: false },
      lightpanda: { binaryExists: false, binaryPath: '' },
      selenium: { webdriverPackageExists: false }
    }
  });

  assert.equal(report.summary.presentTargets >= 3, true);
  assert.equal(report.summary.readiness.agentBrowser, true);
  assert.equal(report.summary.readiness.lightpandaBinary, false);
  assert.equal(report.targets.find((target) => target.id === 'agent-browser').present, true);
  assert.equal(report.targets.find((target) => target.id === 'lightpanda-browser').present, true);
  assert.ok(report.summary.next.some((item) => item.includes('Lightpanda')));

  const markdown = formatSourceAuditMarkdown(report);
  assert.match(markdown, /Secure Browser Agent Source Audit/);
  assert.match(markdown, /agent-browser/);
  assert.match(markdown, /Lightpanda binary: missing/);

  const compact = formatSourceAuditCompact(report);
  assert.match(compact, /^source_targets: 10$/m);
  assert.match(compact, /^source_present_targets: /m);
  assert.match(compact, /^readiness_agent_browser: yes$/m);
  assert.match(compact, /^readiness_lightpanda_binary: no$/m);
  assert.match(compact, /^source_agent_browser_present: yes$/m);
  assert.match(compact, /^source_lightpanda_browser_present: yes$/m);
  assert.match(compact, /^next: .*Lightpanda/m);
  assert.doesNotMatch(compact, /^\{/);
});
