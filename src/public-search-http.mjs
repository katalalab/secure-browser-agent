function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function normalizeDuckDuckGoHref(rawHref) {
  const href = decodeHtml(rawHref);
  try {
    const url = new URL(href, 'https://html.duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    return uddg || url.href;
  } catch {
    return href;
  }
}

export function parseDuckDuckGoHtml(html, { limit = 10 } = {}) {
  const links = [];
  const seen = new Set();
  const pattern = /<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = normalizeDuckDuckGoHref(match[1]);
    const text = stripTags(match[2]);
    if (!href || !text || seen.has(href)) continue;
    seen.add(href);
    links.push({ text, href });
    if (links.length >= limit) break;
  }
  return links;
}

export async function publicSearchHttp(query, options = {}) {
  const provider = options.provider || 'duckduckgo';
  if (provider !== 'duckduckgo') throw new Error(`unsupported HTTP search provider: ${provider}`);
  const limit = Number(options.limit || 10);
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query || '')}`;
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== 'function') throw new Error('fetch is not available');
  const response = await fetcher(url, {
    headers: {
      'user-agent': options.userAgent || 'Mozilla/5.0 secure-browser-agent public-search'
    }
  });
  const html = await response.text();
  const links = parseDuckDuckGoHtml(html, { limit });
  return {
    search: {
      provider: 'duckduckgo-http',
      query,
      challenge: false,
      resultLinks: links.length,
      url,
      status: response.status || 0
    },
    page: {
      title: `${query} at DuckDuckGo HTML`,
      url,
      links,
      headings: [],
      forms: [],
      tables: []
    }
  };
}
