import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ApiError, requireThat } from '../validation.mjs';

const endpoint = 'https://agent.tinyfish.ai/v1/automation/run-research';
const timeoutMs = 95000;

function isPublicAddress(address) {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split('.').map(Number);
    const [a, b] = octets;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return (normalized.startsWith('2') || normalized.startsWith('3')) && !normalized.startsWith('2001:db8:');
  }
  return false;
}

export async function validateFacilityWebsite(value, resolveHost = lookup) {
  let url;
  try { url = new URL(value); } catch { throw new ApiError(400, 'Add a valid HTTPS website URL to this facility before researching it.'); }
  requireThat(url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
    !isIP(url.hostname) && url.hostname.includes('.') && !url.hostname.endsWith('.localhost') && !url.hostname.endsWith('.local'),
  'Facility research requires a public HTTPS website URL.');
  let addresses;
  try {
    let timer;
    try {
      addresses = await Promise.race([
        resolveHost(url.hostname, { all: true, verbatim: true }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS lookup timed out')), 4000); }),
      ]);
    } finally { clearTimeout(timer); }
  } catch { throw new ApiError(400, 'The facility website could not be verified as a public website.'); }
  requireThat(Array.isArray(addresses) && addresses.length > 0 && addresses.every(item => isPublicAddress(item.address)),
    'Facility research requires a public HTTPS website URL.');
  return url;
}

const citationUrl = citation => typeof citation === 'string' ? citation : citation?.url;

function sourceUrls(citations, host) {
  if (!Array.isArray(citations)) return [];
  const safe = [];
  for (const citation of citations) {
    const raw = citationUrl(citation);
    if (typeof raw !== 'string') continue;
    try {
      const url = new URL(raw);
      if (url.protocol === 'https:' && !url.username && !url.password && (url.hostname === host || url.hostname.endsWith(`.${host}`))) safe.push(url.href);
    } catch { /* Ignore malformed citations. */ }
  }
  return [...new Set(safe)];
}

function parseReport(event, host) {
  requireThat(event && typeof event.result === 'string' && event.result.trim(), 'TinyFish returned an empty research report.', 502);
  let report;
  try {
    const text = event.result.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    report = JSON.parse(text);
  } catch { throw new ApiError(502, 'TinyFish returned a research report in an unsupported format.'); }
  requireThat(report && typeof report === 'object' && !Array.isArray(report), 'TinyFish returned an invalid research report.', 502);
  const citations = sourceUrls(event.citations, host);
  const normalizeFindings = (items, nameField) => {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 50).flatMap(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const value = typeof item[nameField] === 'string' ? item[nameField].trim().slice(0, 500) : '';
      if (!value) return [];
      const evidence = Array.isArray(item.evidence) ? [...new Set(item.evidence.filter(url => typeof url === 'string' && citations.includes(url)))].slice(0, 10) : [];
      const evidenceExcerpt = typeof item.excerpt === 'string' ? item.excerpt.trim().slice(0, 500) : '';
      const status = item.status === 'not_found' ? 'not_found' : item.status === 'confirmed' && evidence.length > 0 && evidenceExcerpt ? 'confirmed' : 'unclear';
      return [{ ...(nameField === 'value' && typeof item.type === 'string' ? { type: item.type.slice(0, 80) } : {}), [nameField]: value, status, evidence,
        ...(evidenceExcerpt && evidence.length ? { evidenceExcerpt } : {}),
        ...(nameField === 'name' && typeof item.description === 'string' ? { description: item.description.trim().slice(0, 500) } : {}) }];
    });
  };
  return {
    acceptedMaterials: normalizeFindings(report.acceptedMaterials, 'material'),
    publicContacts: normalizeFindings(report.publicContacts, 'value'),
    services: normalizeFindings(report.services, 'name'),
    citations,
    missingInformation: ['acceptedMaterials', 'publicContacts', 'services'].filter(key => !Array.isArray(report[key]) || report[key].length === 0 || report[key].every(item => !item || item.status === 'not_found')),
  };
}

export function createFacilityResearchService({ datasetModel, fetchImpl = fetch, apiKey = () => process.env.TINYFISH_API_KEY, resolveHost = lookup, now = Date.now }) {
  const requests = new Map();
  const throttle = user => {
    requireThat(user?.id, 'Please sign in to continue.', 401);
    const at = now();
    const bucket = requests.get(user.id);
    if (bucket && at - bucket.startedAt < 60000) {
      requireThat(bucket.count < 5, 'Too many facility research requests. Please try again in a minute.', 429);
      bucket.count++;
    } else requests.set(user.id, { startedAt: at, count: 1 });
    if (requests.size > 10000) for (const [id, value] of requests) if (at - value.startedAt >= 60000) requests.delete(id);
  };
  return {
    async research(facilityId, user) {
      throttle(user);
      const dataset = datasetModel.load();
      const facility = dataset.receivers.find(item => item.id === facilityId);
      requireThat(facility, 'Facility not found.', 404);
      requireThat(typeof facility.websiteUrl === 'string' && facility.websiteUrl.trim(), 'Add a website URL to this facility before starting research.', 422);
      const website = await validateFacilityWebsite(facility.websiteUrl, resolveHost);
      const key = apiKey();
      requireThat(typeof key === 'string' && key.trim(), 'Facility research is not configured. Set TINYFISH_API_KEY in the backend environment.', 503);
      const query = `Research only the official public website at ${website.href} for the facility "${facility.name}". Do not use search results, other domains, or information about similarly named organizations. Return only valid JSON with this shape: {"acceptedMaterials":[{"material":"...","status":"confirmed|unclear|not_found","excerpt":"short exact quote from the cited page","evidence":["source URL"]}],"publicContacts":[{"type":"email|phone|address|other","value":"...","status":"confirmed|unclear|not_found","excerpt":"short exact quote from the cited page","evidence":["source URL"]}],"services":[{"name":"...","description":"...","status":"confirmed|unclear|not_found","excerpt":"short exact quote from the cited page","evidence":["source URL"]}]}. Include only explicitly stated accepted materials and public contact details. Each confirmed finding must include a short exact excerpt and the exact URL where it appears. Do not infer acceptance from general services. Use empty arrays when information is absent.`;
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'X-API-Key': key, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ query, mode: 'instant', domain_filter: { mode: 'exclusive', domains: [website.hostname], block: [] } }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new ApiError(504, 'Facility research timed out. Please try again.');
        throw new ApiError(502, 'Could not reach the TinyFish research service.');
      }
      if (!response.ok) {
        if (response.status === 429) throw new ApiError(429, 'TinyFish research limit reached. Please try again later.');
        if (response.status === 401 || response.status === 403) throw new ApiError(502, 'TinyFish rejected the configured API credentials or research access.');
        throw new ApiError(502, 'TinyFish could not complete facility research.');
      }
      requireThat(response.body && typeof response.body.getReader === 'function', 'TinyFish returned an invalid research stream.', 502);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult;
      let ended = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            let event;
            try { event = JSON.parse(line.slice(5).trim()); } catch { throw new ApiError(502, 'TinyFish returned malformed research events.'); }
            if (event.event === 'error') throw new ApiError(502, 'TinyFish reported a facility research error.');
            if (event.event === 'final_result') finalResult = event;
            if (event.event === 'done') { ended = true; break; }
          }
          if (done || finalResult || ended) break;
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new ApiError(504, 'Facility research timed out. Please try again.');
        throw new ApiError(502, 'TinyFish research stream ended unexpectedly.');
      } finally { reader.releaseLock(); }
      const result = { id: randomUUID(), kind: 'website', facilityId: facility.id, facilityName: facility.name, websiteUrl: website.href, researchedAt: new Date(now()).toISOString(), ...parseReport(finalResult, website.hostname) };
      const saveHistory = () => {
        const currentDataset = datasetModel.load();
        const current = currentDataset.receivers.find(item => item.id === facility.id);
        requireThat(current, 'Facility not found.', 404);
        current.researchHistory = [...(current.researchHistory ?? []), result];
        datasetModel.save(currentDataset);
      };
      if (datasetModel.transaction) datasetModel.transaction(saveHistory);
      else if (datasetModel.save) saveHistory();
      return result;
    },
  };
}
