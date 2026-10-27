import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { ApiError, requireThat, text } from '../validation.mjs';

const webSearchEndpoint = 'https://api.search.brave.com/res/v1/web/search';
const localPoisEndpoint = 'https://api.search.brave.com/res/v1/local/pois';
const requestTimeoutMs = 12000;
const materialTerms = [
  ['concrete', /\b(?:concrete|cement)\b/i],
  ['brick', /\b(?:bricks?|masonry)\b/i],
  ['steel', /\b(?:steel|ferrous metal)\b/i],
  ['timber', /\b(?:timber|wood)\b/i],
  ['plasterboard', /\b(?:plasterboard|drywall|gypsum board)\b/i],
  ['glass', /\bglass\b/i],
  ['asphalt', /\b(?:asphalt|bitumen)\b/i],
  ['aggregate', /\b(?:aggregates?|crushed stone)\b/i],
];
const stopLocationTokens = new Set(['india', 'state', 'district', 'region', 'city', 'sector', 'near', 'road', 'street']);

function publicHttpsUrl(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || isIP(url.hostname) || !url.hostname.includes('.') ||
      url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) return undefined;
    return url.href;
  } catch { return undefined; }
}

function normalize(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function facilityLocationTokens(location) {
  return normalize(location).split(' ').filter(token => token.length >= 4 && !stopLocationTokens.has(token));
}

function exactFacilityMatch(title, description, facility) {
  const name = normalize(facility.name);
  if (!name) return false;
  const titleText = normalize(title);
  const fullText = normalize(`${title ?? ''} ${description ?? ''}`);
  if (!(titleText === name || titleText.startsWith(`${name} `) || fullText.includes(name))) return false;
  const locationTokens = facilityLocationTokens(facility.location);
  return locationTokens.length === 0 || locationTokens.some(token => fullText.includes(token));
}

function sourceUrls(values) {
  return [...new Set(values.map(publicHttpsUrl).filter(Boolean))].slice(0, 10);
}

function explicitAcceptedMaterials(textValue, source) {
  if (!textValue || !source) return [];
  const results = [];
  for (const [material, term] of materialTerms) {
    const match = textValue.match(term);
    if (!match) continue;
    const from = Math.max(0, match.index - 100);
    const to = Math.min(textValue.length, match.index + match[0].length + 100);
    const context = textValue.slice(from, to);
    const affirmative = /\b(?:accepts?|accepting|receives?|receiving|takes?|take|welcomes?)\b/i.test(context);
    const negative = /\b(?:do(?:es)?\s+not|doesn['’]t|never|cannot|can['’]t)\s+(?:accept|receive|take)|\bnot\s+accepted\b/i.test(context);
    if (affirmative && !negative) results.push({ material, status: 'listed', support: 'explicit', evidence: [source], evidenceExcerpt: textValue.slice(0, 500) });
  }
  return results;
}

function requireAuthenticatedUser(user) {
  requireThat(user?.id, 'Please sign in to continue.', 401);
}

function validateManualDetails(input) {
  requireThat(input && typeof input === 'object' && !Array.isArray(input), 'Invalid manual facility details.');
  const strings = (value, field, limit, itemMax) => {
    requireThat(Array.isArray(value) && value.length <= limit, `Invalid ${field}.`);
    return value.map((item, index) => text(item, `${field} ${index + 1}`, itemMax));
  };
  const acceptedMaterials = strings(input.acceptedMaterials, 'accepted material', 30, 120);
  const services = strings(input.services, 'service', 30, 180);
  requireThat(Array.isArray(input.contacts) && input.contacts.length <= 20, 'Invalid contact information.');
  const contacts = input.contacts.map((contact, index) => {
    requireThat(contact && typeof contact === 'object' && !Array.isArray(contact), 'Invalid contact information.');
    const type = text(contact.type, `contact type ${index + 1}`, 40);
    const value = text(contact.value, `contact value ${index + 1}`, 250);
    return { id: typeof contact.id === 'string' && /^[\w-]{1,80}$/.test(contact.id) ? contact.id : randomUUID(), type, value };
  });
  return { acceptedMaterials, contacts, location: text(input.location ?? '', 'location', 250, true), services };
}

export function createFacilityPublicResearchService({ datasetModel, fetchImpl = fetch, apiKey = () => process.env.BRAVE_SEARCH_API_KEY, now = Date.now }) {
  const limits = new Map();
  const throttle = (user, { maximum = 5, windowMs = 60000 } = {}) => {
    requireAuthenticatedUser(user);
    const at = now();
    const bucket = limits.get(user.id);
    if (bucket && at - bucket.startedAt < windowMs) {
      requireThat(bucket.count < maximum, 'Too many facility research requests. Please try again in a minute.', 429);
      bucket.count++;
    } else limits.set(user.id, { startedAt: at, count: 1 });
    if (limits.size > 10000) for (const [key, value] of limits) if (at - value.startedAt >= windowMs) limits.delete(key);
  };

  const facilityById = (facilityId) => {
    const dataset = datasetModel.load();
    const facility = dataset.receivers.find(item => item.id === facilityId);
    requireThat(facility, 'Facility not found.', 404);
    return { dataset, facility };
  };

  const braveJson = async (url, key) => {
    let response;
    try {
      response = await fetchImpl(url, { headers: { 'X-Subscription-Token': key, Accept: 'application/json', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(requestTimeoutMs) });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new ApiError(504, 'Public listing search timed out. Please try again.');
      throw new ApiError(502, 'Could not reach the public listing search service.');
    }
    if (!response.ok) {
      if (response.status === 429) throw new ApiError(429, 'Public listing search limit reached. Please try again later.');
      if ([401, 403].includes(response.status)) throw new ApiError(502, 'The public listing search provider rejected its configured credentials or access.');
      throw new ApiError(502, 'The public listing search provider could not complete the search.');
    }
    try { return await response.json(); } catch { throw new ApiError(502, 'The public listing search provider returned invalid data.'); }
  };

  return {
    publicListingsAvailable() {
      const key = apiKey();
      return typeof key === 'string' && Boolean(key.trim());
    },
    async publicListings(facilityId, user) {
      throttle(user);
      const { facility } = facilityById(facilityId);
      requireThat(!(typeof facility.websiteUrl === 'string' && facility.websiteUrl.trim()), 'Public listing research is available when this facility has no website URL.', 409);
      const key = apiKey();
      requireThat(typeof key === 'string' && key.trim(), 'Public listing research is not configured. Set BRAVE_SEARCH_API_KEY in the backend environment.', 503);
      const name = text(facility.name, 'facility name', 200);
      const location = text(facility.location ?? '', 'facility location', 250, true);
      const safeName = name.replace(/["\\]/g, ' ').trim();
      const safeLocation = location.replace(/["\\]/g, ' ').trim();
      const query = `"${safeName}" ${safeLocation} construction waste recycling facility directory contact accepted materials services`.trim().slice(0, 600);
      const searchUrl = new URL(webSearchEndpoint);
      for (const [field, value] of Object.entries({ q: query, country: 'IN', search_lang: 'en', count: '10', extra_snippets: 'true', result_filter: 'web,locations' })) searchUrl.searchParams.set(field, value);
      const search = await braveJson(searchUrl, key);
      const webResults = Array.isArray(search?.web?.results) ? search.web.results : [];
      const locationResults = Array.isArray(search?.locations?.results) ? search.locations.results : [];
      const matchingWeb = webResults.filter(item => exactFacilityMatch(item.title, item.description, facility)).slice(0, 10);
      const matchingLocations = locationResults.filter(item => exactFacilityMatch(item.title, item.description, facility) && typeof item.id === 'string').slice(0, 3);
      let localPlaces = [];
      if (matchingLocations.length) {
        const detailsUrl = new URL(localPoisEndpoint);
        for (const item of matchingLocations) detailsUrl.searchParams.append('ids', item.id);
        const details = await braveJson(detailsUrl, key);
        localPlaces = Array.isArray(details?.results) ? details.results.filter(place => matchingLocations.some(item => item.id === place.id) && exactFacilityMatch(place.title, place.description, facility)) : [];
      }

      const listings = [];
      const acceptedMaterials = [];
      const publicContacts = [];
      const locations = [];
      const services = [];
      const seen = new Set();
      const addListing = listing => {
        const title = typeof listing.title === 'string' ? listing.title.trim().slice(0, 250) : '';
        const sourceUrl = publicHttpsUrl(listing.sourceUrl);
        const excerpt = typeof listing.excerpt === 'string' ? listing.excerpt.trim().slice(0, 500) : '';
        if (!title || !sourceUrl || seen.has(sourceUrl)) return;
        seen.add(sourceUrl);
        const providerName = typeof listing.providerName === 'string' ? listing.providerName.trim().slice(0, 100) : '';
        listings.push({ title, sourceUrl, providerName: providerName || 'Public web listing', excerpt, status: 'listed' });
      };

      for (const item of matchingWeb) {
        const source = publicHttpsUrl(item.url);
        if (!source) continue;
        const excerpt = text(item.description ?? '', 'listing excerpt', 500, true) || text(item.title ?? '', 'listing title', 250);
        addListing({ title: item.title, sourceUrl: source, providerName: item.profile?.long_name ?? item.profile?.name ?? new URL(source).hostname, excerpt });
        acceptedMaterials.push(...explicitAcceptedMaterials(excerpt, source));
        if (/\b(?:recycl|waste|salvag|demolition|aggregate|construction|material recovery|scrap|reclaimed|processing|reclamation)\w*\b/i.test(excerpt)) {
          services.push({ name: excerpt.slice(0, 180), status: 'listed', support: 'explicit', evidence: [source], evidenceExcerpt: excerpt });
        }
      }

      for (const place of localPlaces) {
        const profileSources = sourceUrls((place.profiles ?? []).map(profile => profile.url));
        const source = profileSources[0] ?? publicHttpsUrl(place.url) ?? publicHttpsUrl(place.provider_url);
        const listingExcerpt = text(place.description ?? '', 'listing description', 500, true);
        addListing({ title: place.title, sourceUrl: source, providerName: place.profiles?.[0]?.long_name ?? place.profiles?.[0]?.name ?? 'Public local listing', excerpt: listingExcerpt });
        if (source && typeof place.contact?.telephone === 'string' && place.contact.telephone.trim()) publicContacts.push({ type: 'phone', value: place.contact.telephone.trim().slice(0, 100), status: 'listed', support: 'category', evidence: [source], evidenceExcerpt: place.contact.telephone.trim().slice(0, 100) });
        if (source && typeof place.contact?.email === 'string' && place.contact.email.trim()) publicContacts.push({ type: 'email', value: place.contact.email.trim().slice(0, 254), status: 'listed', support: 'category', evidence: [source], evidenceExcerpt: place.contact.email.trim().slice(0, 254) });
        const address = place.postal_address?.displayAddress;
        if (source && typeof address === 'string' && address.trim()) locations.push({ type: 'address', value: text(address, 'public address', 300), status: 'listed', support: 'category', evidence: [source], evidenceExcerpt: text(address, 'public address', 300) });
        if (source && Array.isArray(place.categories)) {
          for (const category of place.categories.slice(0, 12)) {
            if (typeof category === 'string' && /recycl|waste|salvag|demolition|aggregate|construction|scrap|material|recovery/i.test(category)) {
              services.push({ name: text(category, 'public listing category', 160), status: 'listed', support: 'category', evidence: [source], evidenceExcerpt: text(category, 'public listing category', 160) });
            }
          }
        }
        for (const related of Array.isArray(place.results) ? place.results.slice(0, 10) : []) {
          const relatedSource = publicHttpsUrl(related.url);
          const relatedExcerpt = text(related.description ?? '', 'listing excerpt', 500, true);
          if (!relatedSource || !relatedExcerpt || !exactFacilityMatch(related.title, relatedExcerpt, facility)) continue;
          addListing({ title: related.title, sourceUrl: relatedSource, providerName: related.profile?.long_name ?? related.profile?.name ?? new URL(relatedSource).hostname, excerpt: relatedExcerpt });
          acceptedMaterials.push(...explicitAcceptedMaterials(relatedExcerpt, relatedSource));
          if (/\b(?:recycl|waste|salvag|demolition|aggregate|construction|material recovery|scrap|reclaimed|processing|reclamation)\w*\b/i.test(relatedExcerpt)) {
            services.push({ name: relatedExcerpt.slice(0, 180), status: 'listed', support: 'explicit', evidence: [relatedSource], evidenceExcerpt: relatedExcerpt });
          }
        }
      }

      const unique = values => [...new Map(values.map(value => [`${value.type ?? value.material ?? value.name}:${value.value ?? value.material ?? value.name}:${value.evidence[0]}`, value])).values()];
      const research = {
        id: randomUUID(), kind: 'public_listings', provider: 'Brave Search', facilityId: facility.id, facilityName: facility.name,
        query, researchedAt: new Date(now()).toISOString(), listings,
        acceptedMaterials: unique(acceptedMaterials), publicContacts: unique(publicContacts), locations: unique(locations), services: unique(services),
        missingInformation: [
          ...(!acceptedMaterials.length ? ['acceptedMaterials'] : []),
          ...(!publicContacts.length ? ['publicContacts'] : []),
          ...(!locations.length ? ['location'] : []),
          ...(!services.length ? ['services'] : []),
          ...(!listings.length ? ['listings'] : []),
        ],
        warning: 'Public listing information is reported by the cited listing and has not been verified with the facility.',
      };
      datasetModel.transaction(() => {
        const dataset = datasetModel.load();
        const current = dataset.receivers.find(item => item.id === facility.id);
        requireThat(current, 'Facility not found.', 404);
        current.researchHistory = [...(current.researchHistory ?? []), research];
        datasetModel.save(dataset);
      });
      return research;
    },

    saveManualDetails(facilityId, input, user) {
      throttle(user, { maximum: 20 });
      const details = validateManualDetails(input);
      return datasetModel.transaction(() => {
        const dataset = datasetModel.load();
        const facility = dataset.receivers.find(item => item.id === facilityId);
        requireThat(facility, 'Facility not found.', 404);
        requireThat(datasetModel.ownerId(facilityId) === user.id, 'Only this facility’s owner can edit manual details.', 403);
        const expectedUpdatedAt = input.expectedUpdatedAt;
        const current = facility.manualDetails;
        requireThat(expectedUpdatedAt === (current?.updatedAt ?? null), 'Manual facility details changed since you opened them. Refresh and review the latest version before saving.', 409);
        if (current) facility.manualDetailsHistory = [...(facility.manualDetailsHistory ?? []), current];
        const saved = { id: current?.id ?? randomUUID(), updatedAt: new Date(now()).toISOString(), ...details };
        facility.manualDetails = saved;
        datasetModel.save(dataset);
        return { manualDetails: saved, manualDetailsHistory: facility.manualDetailsHistory ?? [] };
      });
    },
  };
}
