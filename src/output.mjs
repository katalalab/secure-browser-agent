import fs from 'node:fs';
import path from 'node:path';

export function toPosixPath(relativePath) {
  // Emitted paths are part of the CLI contract: they land in runs/ JSON, get compared across
  // machines, and get pasted back as arguments. path.relative() yields backslashes on Windows,
  // which made the same command produce different artifacts per OS.
  return String(relativePath ?? '').split(path.sep).join('/');
}

export function safeOutputPath(policy, outPath) {
  if (!outPath) return '';
  const safeName = String(outPath).replace(/^[/\\]+/, '');
  if (safeName.includes('..')) throw new Error(`invalid output path: ${outPath}`);
  return path.join(policy.outputDir, safeName);
}

function valuesAtPath(value, resultPath) {
  if (!resultPath) return Array.isArray(value) ? value : [value];
  const [head, ...rest] = resultPath.split('.');
  const isArray = head.endsWith('[]');
  const key = isArray ? head.slice(0, -2) : head;
  const next = key ? value?.[key] : value;
  if (next === undefined) return [];
  if (isArray) {
    if (!Array.isArray(next)) return [];
    return next.flatMap((item) => valuesAtPath(item, rest.join('.')));
  }
  if (rest.length === 0) return Array.isArray(next) ? next : [next];
  return valuesAtPath(next, rest.join('.'));
}

function rowWithPage(row, page, pageIndex) {
  const pageFields = {
    pageIndex,
    inputUrl: page.inputUrl || '',
    pageUrl: page.url || ''
  };
  if (row && typeof row === 'object' && !Array.isArray(row)) return { ...pageFields, ...row };
  return { ...pageFields, value: row };
}

function selectRowsByPath(value, resultPath) {
  if (resultPath.startsWith('pages[].')) {
    const pages = value?.pages || value?.results?.pages;
    if (!Array.isArray(pages)) throw new Error(`CSV result not found: ${resultPath}`);
    const rest = resultPath.slice('pages[].'.length);
    return pages.flatMap((page, pageIndex) => valuesAtPath(page, rest).map((row) => rowWithPage(row, page, pageIndex)));
  }
  const selected = valuesAtPath(value, resultPath);
  if (selected.length === 0) throw new Error(`CSV result not found: ${resultPath}`);
  return selected;
}

export function selectRowsForCsv(value, resultName = '') {
  if (Array.isArray(value)) return value;
  if (resultName) {
    if (resultName.includes('.') || resultName.includes('[]')) return selectRowsByPath(value, resultName);
    const selected = value?.results?.[resultName] ?? value?.[resultName];
    if (selected === undefined) throw new Error(`CSV result not found: ${resultName}`);
    return Array.isArray(selected) ? selected : [selected];
  }
  if (Array.isArray(value?.resources)) return value.resources;
  if (value?.results && typeof value.results === 'object') {
    const arrays = Object.entries(value.results).filter(([, item]) => Array.isArray(item));
    if (arrays.length === 1) return arrays[0][1];
    if (arrays.length > 1) throw new Error('CSV output needs --result because the recipe has multiple array results');
  }
  return [value];
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows) {
  const normalized = rows.map((row) => (row && typeof row === 'object' && !Array.isArray(row) ? row : { value: row }));
  const fields = Array.from(new Set(normalized.flatMap((row) => Object.keys(row))));
  return [
    fields.map(csvCell).join(','),
    ...normalized.map((row) => fields.map((field) => csvCell(row[field])).join(','))
  ].join('\n');
}

export function writeOutput(policy, flags, value, metadata = {}) {
  const format = flags.format || 'json';
  if (!flags.out) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }

  const target = safeOutputPath(policy, flags.out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (format === 'csv') {
    const rows = selectRowsForCsv(value, flags.result || '');
    fs.writeFileSync(target, `\uFEFF${toCsv(rows)}\n`, 'utf8');
  } else if (format === 'json') {
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } else {
    throw new Error(`unsupported output format: ${format}`);
  }
  if (flags.manifest) {
    fs.writeFileSync(`${target}.manifest.json`, `${JSON.stringify({
      ...metadata,
      output: target,
      format,
      result: flags.result || '',
      policy: policy.source,
      createdAt: new Date().toISOString()
    }, null, 2)}\n`, 'utf8');
  }
  if (!flags.quiet) process.stdout.write(`${target}\n`);
}
