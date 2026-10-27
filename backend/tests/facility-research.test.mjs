import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './databaseHarness.mjs';
import { ApiError } from '../src/validation.mjs';
import { createFacilityResearchService, validateFacilityWebsite } from '../src/services/facility-research.service.mjs';

test('facility research endpoint requires authentication and passes selected facility id', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-facility-research-'));
  let requestedId;
  const server = createBackend({ dataDir: directory, facilityResearchService: {
    publicListingsAvailable() { return true; },
    async research(id) { requestedId = id; return { facilityId: id }; },
    async publicListings(id) { return { facilityId: id, kind: 'public_listings' }; },
    async saveManualDetails(id, input) { return { facilityId: id, manualDetails: input }; },
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = '';
  const call = async (path, method = 'GET', body, status = 200) => {
    const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-GreenLoop-Client': 'web', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  };
  try {
    await call('/facilities/R-1/research', 'POST', undefined, 401);
    await call('/facilities/R-1/public-research', 'POST', undefined, 401);
    await call('/facility-research/public-listings-status', 'GET', undefined, 401);
    await call('/facilities/R-1/manual-details', 'PUT', {}, 401);
    await call('/auth/register', 'POST', { email: 'research@example.com', password: 'password123' }, 201);
    const facilityId = (await call('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', websiteUrl: 'https://facility.example.com' })).user.receiverId;
    const savedFacility = (await call('/dataset')).dataset.receivers.find(item => item.id === facilityId);
    assert.equal(savedFacility.websiteUrl, 'https://facility.example.com');
    const result = await call(`/facilities/${facilityId}/research`, 'POST');
    assert.equal(requestedId, facilityId);
    assert.equal(result.research.facilityId, facilityId);
    assert.equal((await call(`/facilities/${facilityId}/public-research`, 'POST')).research.kind, 'public_listings');
    assert.equal((await call('/facility-research/public-listings-status')).available, true);
    assert.equal((await call(`/facilities/${facilityId}/manual-details`, 'PUT', { location: 'Pune' })).manualDetails.location, 'Pune');
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('research requires a website and rejects unsafe facility URLs without calling TinyFish', async () => {
  let calls = 0;
  const makeService = facility => createFacilityResearchService({
    datasetModel: { load: () => ({ receivers: [facility] }) }, apiKey: () => 'test-key', fetchImpl: async () => { calls++; throw new Error('unexpected'); },
    resolveHost: async () => [{ address: '127.0.0.1', family: 4 }],
  });
  await assert.rejects(makeService({ id: 'R-1', name: 'Yard' }).research('R-1', { id: 'user' }), error => error.status === 422 && /Add a website URL/.test(error.message));
  await assert.rejects(makeService({ id: 'R-1', name: 'Yard', websiteUrl: 'https://yard.example.com' }).research('R-1', { id: 'user' }), error => error.status === 400 && /public HTTPS/.test(error.message));
  assert.equal(calls, 0);
});

test('TinyFish request is domain-restricted and only cited findings are confirmed', async () => {
  let sent;
  const event = {
    event: 'final_result',
    result: JSON.stringify({
      acceptedMaterials: [{ material: 'Clean concrete', status: 'confirmed', excerpt: 'We accept clean concrete.', evidence: ['https://yard.example.com/materials'] }, { material: 'Steel', status: 'confirmed', excerpt: 'We accept steel.', evidence: [] }],
      publicContacts: [{ type: 'email', value: 'info@yard.example.com', status: 'confirmed', excerpt: 'Email us at info@yard.example.com.', evidence: ['https://yard.example.com/contact'] }],
      services: [{ name: 'Sorting', description: 'Material sorting', status: 'confirmed', excerpt: 'We offer sorting.', evidence: ['https://outside.example.org/services'] }],
    }),
    citations: ['https://yard.example.com/materials', 'https://yard.example.com/contact', 'https://outside.example.org/services'],
  };
  const service = createFacilityResearchService({
    datasetModel: { load: () => ({ receivers: [{ id: 'R-2', name: 'Reuse Yard', websiteUrl: 'https://yard.example.com' }] }) },
    apiKey: () => 'test-key', resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async (url, options) => {
      sent = { url, options };
      return new Response(`data: ${JSON.stringify(event)}\n\ndata: {"event":"done"}\n\n`, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  const result = await service.research('R-2', { id: 'user' });
  assert.equal(sent.url, 'https://agent.tinyfish.ai/v1/automation/run-research');
  assert.equal(sent.options.headers['X-API-Key'], 'test-key');
  const request = JSON.parse(sent.options.body);
  assert.deepEqual(request.domain_filter, { mode: 'exclusive', domains: ['yard.example.com'], block: [] });
  assert.equal(result.acceptedMaterials[0].status, 'confirmed');
  assert.equal(result.acceptedMaterials[0].evidenceExcerpt, 'We accept clean concrete.');
  assert.equal(result.acceptedMaterials[1].status, 'unclear');
  assert.deepEqual(result.services[0].evidence, []);
  assert.deepEqual(result.services[0].status, 'unclear');
  assert.equal(result.publicContacts[0].type, 'email');
});

test('invalid API credentials and malformed TinyFish responses become safe API errors', async () => {
  const facility = { id: 'R-3', name: 'Yard', websiteUrl: 'https://yard.example.com' };
  const options = { datasetModel: { load: () => ({ receivers: [facility] }) }, resolveHost: async () => [{ address: '93.184.216.34', family: 4 }] };
  await assert.rejects(createFacilityResearchService({ ...options, apiKey: () => '' }).research('R-3', { id: 'user' }), error => error.status === 503);
  await assert.rejects(createFacilityResearchService({ ...options, apiKey: () => 'test-key', fetchImpl: async () => new Response('upstream detail', { status: 403 }) }).research('R-3', { id: 'user' }), error => error.status === 502 && !error.message.includes('upstream detail'));
  await assert.rejects(createFacilityResearchService({ ...options, apiKey: () => 'test-key', fetchImpl: async () => new Response('data: {"event":"final_result","result":"not-json","citations":[]}\n\n', { status: 200 }) }).research('R-3', { id: 'user' }), error => error instanceof ApiError && error.status === 502);
});

test('facility website validation rejects credentialed, non-HTTPS, and private hosts', async () => {
  await assert.rejects(validateFacilityWebsite('http://yard.example.com', async () => []), error => error.status === 400);
  await assert.rejects(validateFacilityWebsite('https://user:pass@yard.example.com', async () => []), error => error.status === 400);
  await assert.rejects(validateFacilityWebsite('https://yard.example.com', async () => [{ address: '10.0.0.12', family: 4 }]), error => error.status === 400);
});
