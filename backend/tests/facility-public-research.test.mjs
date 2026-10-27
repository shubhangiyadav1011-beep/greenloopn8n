import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacilityPublicResearchService } from '../src/services/facility-public-research.service.mjs';

function model() {
  const dataset = { receivers: [{ id: 'R-1', name: 'North Reuse Yard', location: 'Pune, Maharashtra', acceptedTypes: ['glass'], websiteUrl: undefined }] };
  return {
    load: () => dataset,
    save: value => Object.assign(dataset, structuredClone(value)),
    transaction: fn => fn(),
    ownerId: id => id === 'R-1' ? 'owner-1' : undefined,
  };
}

test('public research requires configuration, signs requests with provider key and returns only name/location-matching cited listings', async () => {
  const datasetModel = model();
  let sent;
  const service = createFacilityPublicResearchService({
    datasetModel,
    apiKey: () => 'provider-test-token',
    fetchImpl: async (url, options) => {
      sent = { url: String(url), options };
      return Response.json({ web: { results: [
        { title: 'North Reuse Yard Pune', url: 'https://directory.example/north-yard', description: 'North Reuse Yard accepts clean concrete and offers recycling in Pune.' },
        { title: 'North Reuse Yard Delhi', url: 'https://unrelated.example/north-yard', description: 'North Reuse Yard accepts brick in Delhi.' },
        { title: 'Other Yard Pune', url: 'https://directory.example/other', description: 'Other Yard accepts steel in Pune.' },
      ] }, locations: { results: [] } });
    },
  });
  assert.equal(service.publicListingsAvailable(), true);
  const result = await service.publicListings('R-1', { id: 'owner-1' });
  assert.equal(sent.url.startsWith('https://api.search.brave.com/res/v1/web/search?'), true);
  assert.equal(sent.options.headers['X-Subscription-Token'], 'provider-test-token');
  assert.equal(result.listings.length, 1);
  assert.equal(result.acceptedMaterials[0].material, 'concrete');
  assert.equal(result.acceptedMaterials[0].status, 'listed');
  assert.equal(result.acceptedMaterials[0].evidence[0], 'https://directory.example/north-yard');
  assert.match(result.warning, /not been verified/);
  assert.equal(datasetModel.load().receivers[0].researchHistory[0].id, result.id);
});

test('public search explains missing setup and rejects wrong owner, stale manual edit and unsafe source URLs', async () => {
  const datasetModel = model();
  const missingKey = createFacilityPublicResearchService({ datasetModel, apiKey: () => '', fetchImpl: async () => { throw new Error('must not call'); } });
  assert.equal(missingKey.publicListingsAvailable(), false);
  await assert.rejects(missingKey.publicListings('R-1', { id: 'owner-1' }), error => error.status === 503 && /BRAVE_SEARCH_API_KEY/.test(error.message));
  const service = createFacilityPublicResearchService({ datasetModel, apiKey: () => 'unused', fetchImpl: async () => Response.json({ web: { results: [{ title: 'North Reuse Yard Pune', url: 'http://127.0.0.1/private', description: 'North Reuse Yard accepts concrete in Pune.' }] }, locations: { results: [] } }) });
  const noUnsafe = await service.publicListings('R-1', { id: 'owner-1' });
  assert.deepEqual(noUnsafe.listings, []);
  assert.throws(() => service.saveManualDetails('R-1', { acceptedMaterials: [], contacts: [], location: '', services: [], expectedUpdatedAt: null }, { id: 'other' }), error => error.status === 403);
  const saved = service.saveManualDetails('R-1', { acceptedMaterials: ['Concrete'], contacts: [{ type: 'phone', value: '123' }], location: 'Pune', services: ['Sorting'], expectedUpdatedAt: null }, { id: 'owner-1' });
  assert.equal(saved.manualDetails.acceptedMaterials[0], 'Concrete');
  assert.equal(saved.manualDetailsHistory.length, 0);
  datasetModel.load().receivers[0].researchHistory.push({ id: 'history', kind: 'public_listings' });
  const revised = service.saveManualDetails('R-1', { acceptedMaterials: ['Concrete', 'Brick'], contacts: [], location: 'Pune', services: [], expectedUpdatedAt: saved.manualDetails.updatedAt }, { id: 'owner-1' });
  assert.equal(revised.manualDetailsHistory.length, 1);
  assert.equal(datasetModel.load().receivers[0].researchHistory.length, 2);
  assert.throws(() => service.saveManualDetails('R-1', { acceptedMaterials: [], contacts: [], location: '', services: [], expectedUpdatedAt: null }, { id: 'owner-1' }), error => error.status === 409);
});
