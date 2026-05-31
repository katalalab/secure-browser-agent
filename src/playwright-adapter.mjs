import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildOutlineScript } from './extract-script.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function candidatePlaywrightCorePaths() {
  return [
    process.env.PLAYWRIGHT_CORE_PATH,
    path.resolve(here, '../../playwright-mcp/node_modules/playwright-core/index.js')
  ].filter(Boolean);
}

function locateChromeForTesting() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browserRoot = path.join(process.env.HOME || '', '.agent-browser/browsers');
  if (!fs.existsSync(browserRoot)) return undefined;
  const candidates = fs.readdirSync(browserRoot)
    .filter((name) => name.startsWith('chrome-'))
    .sort()
    .reverse()
    .map((name) => path.join(browserRoot, name, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
  return candidates.find((candidate) => fs.existsSync(candidate));
}

export async function loadPlaywrightCore() {
  for (const candidate of candidatePlaywrightCorePaths()) {
    if (!fs.existsSync(candidate)) continue;
    return import(pathToFileURL(candidate).href);
  }
  throw new Error('playwright-core not found; set PLAYWRIGHT_CORE_PATH or install local playwright-mcp');
}

export async function outlineWithPlaywright(url, { linkLimit = 100 } = {}) {
  const loaded = await loadPlaywrightCore();
  const { chromium } = loaded.chromium ? loaded : loaded.default;
  const executablePath = locateChromeForTesting();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    timeout: 10000
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(10000);
    if (url.startsWith('data:text/html,')) {
      await page.setContent(decodeURIComponent(url.slice('data:text/html,'.length)));
    } else {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    }
    return await page.evaluate(buildOutlineScript({ linkLimit }));
  } finally {
    await browser.close();
  }
}
