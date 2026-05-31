import fs from 'node:fs';
import { redact } from './policy.mjs';

export function summarizeHarFile(path, policy) {
  const har = JSON.parse(fs.readFileSync(path, 'utf8'));
  const entries = har.log?.entries || [];
  const hosts = new Map();
  const methods = new Map();
  const statuses = new Map();
  const resources = [];

  for (const entry of entries) {
    const request = entry.request || {};
    const response = entry.response || {};
    const url = new URL(request.url || 'http://invalid.local/');
    hosts.set(url.host, (hosts.get(url.host) || 0) + 1);
    methods.set(request.method || 'GET', (methods.get(request.method || 'GET') || 0) + 1);
    statuses.set(String(response.status || 0), (statuses.get(String(response.status || 0)) || 0) + 1);
    resources.push({
      method: request.method || '',
      host: url.host,
      path: url.pathname,
      status: response.status || 0,
      mimeType: response.content?.mimeType || '',
      size: response.bodySize || response.content?.size || 0
    });
  }

  return redact({
    pages: har.log?.pages?.length || 0,
    entries: entries.length,
    hosts: Object.fromEntries(hosts),
    methods: Object.fromEntries(methods),
    statuses: Object.fromEntries(statuses),
    resources
  }, policy);
}
