export function buildExtractScript({ selector = 'body', limit = 50, fields = ['text', 'href'] } = {}) {
  const normalizedFields = fields.map((field) => field.trim()).filter(Boolean);
  return `
(() => {
const selector = ${JSON.stringify(selector)};
const limit = ${Number(limit) || 50};
const fields = ${JSON.stringify(normalizedFields)};
const pick = (element, field) => {
  if (field === 'text') return element.innerText || element.textContent || '';
  if (field === 'html') return element.innerHTML || '';
  if (field === 'tag') return element.tagName.toLowerCase();
  if (field === 'role') return element.getAttribute('role') || '';
  if (field === 'href') return element.href || element.getAttribute('href') || '';
  if (field === 'src') return element.src || element.getAttribute('src') || '';
  if (field.startsWith('attr:')) return element.getAttribute(field.slice(5)) || '';
  return '';
};
return Array.from(document.querySelectorAll(selector)).slice(0, limit).map((element, index) => {
  const row = { index };
  for (const field of fields) row[field] = pick(element, field);
  return row;
});
})()
`;
}

export function buildOutlineScript({ linkLimit = 100 } = {}) {
  return `
(() => {
const text = (node) => (node?.innerText || node?.textContent || '').trim().replace(/\\s+/g, ' ');
const attr = (node, name) => node?.getAttribute(name) || '';
return ({
  title: document.title,
  url: location.href,
  headings: Array.from(document.querySelectorAll('h1,h2,h3')).map((node) => ({
    level: node.tagName.toLowerCase(),
    text: text(node)
  })).filter((row) => row.text),
  links: Array.from(document.querySelectorAll('a[href]')).slice(0, ${Number(linkLimit) || 100}).map((node) => ({
    text: text(node),
    href: node.href || attr(node, 'href')
  })),
  forms: Array.from(document.forms).map((form, index) => ({
    index,
    id: form.id || '',
    name: form.name || '',
    method: (form.method || 'get').toLowerCase(),
    action: form.action || attr(form, 'action'),
    controls: Array.from(form.elements).map((control) => ({
      tag: control.tagName.toLowerCase(),
      type: control.type || '',
      name: control.name || '',
      id: control.id || '',
      label: text(control.labels?.[0])
    }))
  })),
  tables: Array.from(document.querySelectorAll('table')).map((table, index) => ({
    index,
    caption: text(table.caption),
    headers: Array.from(table.querySelectorAll('th')).map((node) => text(node)).filter(Boolean),
    rows: table.querySelectorAll('tbody tr, tr').length
  }))
});
})()
`;
}

export function buildObserveScript({ linkLimit = 25, controlLimit = 40, textLimit = 600 } = {}) {
  return `
(() => {
const text = (node) => (node?.innerText || node?.textContent || '').trim().replace(/\\s+/g, ' ');
const attr = (node, name) => node?.getAttribute(name) || '';
const esc = (value) => globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\\\"');
const selectorFor = (node) => {
  if (!node?.tagName) return '';
  const tag = node.tagName.toLowerCase();
  if (node.id) return \`#\${esc(node.id)}\`;
  if (node.name) return \`\${tag}[name="\${esc(node.name)}"]\`;
  const label = attr(node, 'aria-label');
  if (label) return \`\${tag}[aria-label="\${esc(label)}"]\`;
  return tag;
};
const controls = Array.from(document.querySelectorAll('input,textarea,select,button,[role="button"],a[href]')).slice(0, ${Number(controlLimit) || 40}).map((node) => ({
  tag: node.tagName.toLowerCase(),
  type: node.type || attr(node, 'role') || '',
  name: node.name || '',
  id: node.id || '',
  label: text(node.labels?.[0]) || attr(node, 'aria-label') || text(node),
  href: node.href || attr(node, 'href'),
  selector: selectorFor(node)
}));
return ({
  title: document.title,
  url: location.href,
  counts: {
    headings: document.querySelectorAll('h1,h2,h3').length,
    links: document.querySelectorAll('a[href]').length,
    forms: document.forms.length,
    controls: document.querySelectorAll('input,textarea,select,button,[role="button"],a[href]').length,
    tables: document.querySelectorAll('table').length
  },
  headings: Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 12).map((node) => ({
    level: node.tagName.toLowerCase(),
    text: text(node)
  })).filter((row) => row.text),
  links: Array.from(document.querySelectorAll('a[href]')).slice(0, ${Number(linkLimit) || 25}).map((node) => ({
    text: text(node),
    href: node.href || attr(node, 'href')
  })).filter((row) => row.text || row.href),
  forms: Array.from(document.forms).slice(0, 8).map((form, index) => ({
    index,
    id: form.id || '',
    name: form.name || '',
    method: (form.method || 'get').toLowerCase(),
    action: form.action || attr(form, 'action'),
    controls: Array.from(form.elements).slice(0, 20).map((control) => ({
      tag: control.tagName.toLowerCase(),
      type: control.type || '',
      name: control.name || '',
      id: control.id || '',
      label: text(control.labels?.[0]) || attr(control, 'aria-label')
    }))
  })),
  controls,
  textSample: text(document.querySelector('main') || document.body).slice(0, ${Number(textLimit) || 600})
});
})()
`;
}

export function buildInspectScript({ candidateLimit = 20, sampleLimit = 3 } = {}) {
  return `
(() => {
const text = (node) => (node?.innerText || node?.textContent || '').trim().replace(/\\s+/g, ' ');
const attr = (node, name) => node?.getAttribute(name) || '';
const esc = (value) => globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\\\"');
const selectorFor = (node) => {
  if (!node?.tagName) return '';
  const tag = node.tagName.toLowerCase();
  if (node.id) return \`#\${esc(node.id)}\`;
  const testId = attr(node, 'data-testid') || attr(node, 'data-test') || attr(node, 'data-qa');
  if (testId) return \`\${tag}[data-testid="\${esc(testId)}"],\${tag}[data-test="\${esc(testId)}"],\${tag}[data-qa="\${esc(testId)}"]\`;
  const cls = Array.from(node.classList || []).filter((item) => item && !/^css-/.test(item)).slice(0, 2);
  if (cls.length) return \`\${tag}.\${cls.map(esc).join('.')}\`;
  return tag;
};
const fieldHints = (node) => {
  const hints = ['text', 'tag'];
  if (node.matches?.('a[href]')) hints.push('href');
  if (node.matches?.('img[src],source[src]')) hints.push('src', 'attr:alt');
  for (const name of ['title', 'aria-label', 'datetime', 'data-testid']) {
    if (attr(node, name)) hints.push(\`attr:\${name}\`);
  }
  return Array.from(new Set(hints));
};
const sampleRows = (selector) => Array.from(document.querySelectorAll(selector)).slice(0, ${Number(sampleLimit) || 3}).map((node, index) => ({
  index,
  text: text(node).slice(0, 180),
  href: node.href || attr(node, 'href'),
  src: node.src || attr(node, 'src')
}));
const candidateMap = new Map();
for (const row of Array.from(document.querySelectorAll('main li, main article, main [role="listitem"], main tr, li, article, [role="listitem"], tr'))
  .map((node) => ({ node, selector: selectorFor(node), count: 0 }))
  .filter((row) => row.selector)
  .map((row) => ({ ...row, count: document.querySelectorAll(row.selector).length }))
  .filter((row) => row.count > 1)) {
  if (!candidateMap.has(row.selector)) candidateMap.set(row.selector, row);
}
const repeated = Array.from(candidateMap.values())
  .sort((a, b) => b.count - a.count)
  .slice(0, ${Number(candidateLimit) || 20})
  .map(({ node, selector, count }) => ({
    kind: node.tagName.toLowerCase(),
    selector,
    count,
    sampleFields: fieldHints(node),
    sampleRows: sampleRows(selector)
  }));
const tables = Array.from(document.querySelectorAll('table')).slice(0, 10).map((table, index) => ({
  index,
  selector: selectorFor(table),
  caption: text(table.caption),
  headers: Array.from(table.querySelectorAll('th')).map((node) => text(node)).filter(Boolean),
  rows: table.querySelectorAll('tbody tr, tr').length
}));
const links = {
  selector: 'a[href]',
  count: document.querySelectorAll('a[href]').length,
  sampleFields: ['text', 'href'],
  sampleRows: sampleRows('a[href]')
};
return {
  title: document.title,
  url: location.href,
  candidates: repeated,
  tables,
  links
};
})()
`;
}
