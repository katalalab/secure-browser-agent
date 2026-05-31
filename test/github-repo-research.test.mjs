import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildGithubRepoResearch, formatGithubRepoResearchCompact, formatGithubRepoResearchMarkdown, writeGithubRepoResearch } from '../src/github-repo-research.mjs';

function writeLocalRepo(dir, remote) {
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git/config'), `[remote "origin"]\n\turl = ${remote}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'README.md'), '# browser automation with playwright and chrome devtools mcp\n', 'utf8');
}

test('github repo research combines popular starred and local clone signals without secrets', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-gh-research-root-'));
  const localRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-gh-research-local-'));
  writeLocalRepo(path.join(localRoot, 'AgentDeskAI/browser-tools-mcp'), 'https://github.com/AgentDeskAI/browser-tools-mcp.git');
  const ghRunner = (args) => {
    if (args[0] === 'search') {
      return JSON.stringify([
        {
          fullName: 'vercel-labs/agent-browser',
          stargazersCount: 12345,
          description: 'Browser automation CLI for AI agents',
          url: 'https://github.com/vercel-labs/agent-browser',
          updatedAt: '2026-06-01T00:00:00Z',
          language: 'Rust'
        },
        {
          fullName: 'SeleniumHQ/selenium',
          stargazersCount: 30000,
          description: 'Browser automation framework',
          url: 'https://github.com/SeleniumHQ/selenium',
          updatedAt: '2026-06-01T00:00:00Z',
          language: 'Java'
        }
      ]);
    }
    if (args[0] === 'api') {
      return JSON.stringify([
        {
          full_name: 'browser-use/browser-use',
          stargazers_count: 70000,
          description: 'Make websites accessible for AI agents',
          html_url: 'https://github.com/browser-use/browser-use',
          updated_at: '2026-06-01T00:00:00Z',
          language: 'Python'
        }
      ]);
    }
    throw new Error(`unexpected gh args: ${args.join(' ')}`);
  };

  const report = buildGithubRepoResearch({
    rootDir,
    localRoots: [],
    localPaths: [path.join(localRoot, 'AgentDeskAI/browser-tools-mcp')],
    ghRunner,
    queries: ['browser automation'],
    limit: 5,
    generatedAt: '2026-06-01T00:00:00.000Z',
    retrievalDate: '2026-06-01'
  });

  assert.equal(report.safeMode, true);
  assert.equal(report.statusOnly, true);
  assert.equal(report.secretValuesRead, false);
  assert.equal(report.opensBrowserNow, false);
  assert.equal(report.popular[0].fullName, 'SeleniumHQ/selenium');
  assert.equal(report.starred[0].fullName, 'browser-use/browser-use');
  assert.equal(report.local[0].remote, 'https://github.com/AgentDeskAI/browser-tools-mcp.git');
  assert.equal(report.popular.find((repo) => repo.fullName === 'vercel-labs/agent-browser').posture, 'adopt-engine-reference');
  assert.equal(report.starred[0].posture, 'agent-pattern-study');
  assert.match(report.summary.recommendation, /direct CDP\/agent-browser/);

  const compact = formatGithubRepoResearchCompact(report);
  assert.match(compact, /^popular_count: 2$/m);
  assert.match(compact, /^starred_count: 1$/m);
  assert.match(compact, /^local_clone_count: 1$/m);
  assert.match(compact, /^popular_1: SeleniumHQ\/selenium stars=30000 posture=compatibility-only$/m);
  assert.match(compact, /^starred_1: browser-use\/browser-use stars=70000 posture=agent-pattern-study$/m);
  assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'github-repo-research'/m);
  assert.doesNotMatch(compact, /^\{/);

  const markdown = formatGithubRepoResearchMarkdown(report);
  assert.match(markdown, /GitHub Browser Automation Repository Research/);
  assert.match(markdown, /vercel-labs\/agent-browser/);

  const outputPath = writeGithubRepoResearch(rootDir, report, 'research/report.json');
  assert.equal(fs.existsSync(outputPath), true);
  assert.throws(() => writeGithubRepoResearch(rootDir, report, '../report.json'), /invalid github repo research output path/);
});
