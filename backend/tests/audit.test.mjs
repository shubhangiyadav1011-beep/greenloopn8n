import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createBackend, expirePostgresSlots } from './databaseHarness.mjs';
import { createMockPaymentProvider } from '../src/services/payment-provider.mock.mjs';
import { recoveryFlowTotals, receiverCapacityTotals } from '../../shared/domain/metrics.ts';

test('audit: endpoint contracts, malformed inputs, stale offers and rescheduling', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-audit-'));
  const server = createBackend({ dataDir: directory, paymentProvider: createMockPaymentProvider({ delayMs: 5 }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (path, method = 'GET', data, expected = 200) => {
      const response = await fetch(`${base}${path}`, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', 'X-GreenLoop-Client': 'web', Cookie: cookie }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
      return result;
    };
  };
  const provider = client(), receiver = client(), anonymous = client();
  const act = (request, action, args, expected = 200) => request('/api/actions', 'POST', { action, args }, expected);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const later = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  try {
    assert.equal((await anonymous('/api/health')).status, 'ok');
    assert.equal(typeof (await anonymous('/api/config')).googleEnabled, 'boolean');
    await anonymous('/api/auth/google', 'GET', undefined, 503);
    await anonymous('/api/auth/google/callback', 'GET', undefined, 302);
    await anonymous('/api/auth/register', 'POST', { email: 'invalid', password: 'short' }, 400);
    await provider('/api/auth/register', 'POST', { email: 'audit-provider@example.com', password: 'audit-password123' }, 201);
    await provider('/api/profile', 'PATCH', { workspaces: ['provider'] });
    await receiver('/api/auth/register', 'POST', { email: 'audit-receiver@example.com', password: 'audit-password123' }, 201);
    const facility = (await receiver('/api/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', organization: 'Audit yard' })).user.receiverId;
    await provider('/api/profile', 'PATCH', { activeWorkspace: 'receiver' }, 403);
    const project = (await act(provider, 'addProjectAction', [{ name: 'Audit demolition', location: 'Delhi', status: 'demolition' }])).result;
    const input = { projectId: project.id, type: 'concrete', quantityT: 20, quantityRangeT: [20, 20], condition: 'good', grade: 'A', confidence: 1, evidence: [], pricePerT: 1000 };
    const material = (await act(provider, 'addMaterialAction', [input])).result;
    await act(provider, 'addMaterialAction', [{ ...input, evidence: [null] }], 400);
    await act(provider, 'addMaterialAction', [{ ...input, projectId: {} }], 400);
    await act(provider, 'addMaterialAction', [{ ...input, quantityRangeT: [30, 40] }], 400);
    await act(provider, 'unknown', [{}], 404);
    await anonymous('/api/dataset', 'GET', undefined, 401);
    await provider('/api/nonexistent', 'GET', undefined, 404);
    await provider('/api/uploads/missing', 'GET', undefined, 404);
    await anonymous('/images/missing-audit-image.png', 'GET', undefined, 404);
    const small = (await act(receiver, 'addCapacityAction', [{ receiverId: facility, date: tomorrow, materialType: 'concrete', capacityT: 1 }])).result;
    const target = (await act(receiver, 'addCapacityAction', [{ receiverId: facility, date: later, materialType: 'concrete', capacityT: 1 }])).result;
    await act(receiver, 'addCapacityAction', [{ receiverId: facility, date: later, materialType: 'concrete', capacityT: 5 }], 409);
    await act(receiver, 'addCapacityAction', [{ receiverId: facility, date: '2020-01-01', materialType: 'brick', capacityT: 5 }], 400);
    await act(receiver, 'addDemandAction', [{ materialType: 'concrete', requiredT: 5, period: '2020-01-01', location: 'Delhi' }], 400);
    await act(provider, 'requestCapacityAction', [{ materialId: material.id, receiverId: facility, slotId: small.id, tonnesT: 2 }]);
    const held = (await provider('/api/dataset')).dataset.bookings[0];
    assert.equal(held.status, 'hold');
    const heldDataset = (await provider('/api/dataset')).dataset;
    assert.equal(recoveryFlowTotals(heldDataset).reserved, 0);
    assert.equal(receiverCapacityTotals(heldDataset)[0].available, 2);
    await act(provider, 'requestCapacityAction', [{ materialId: material.id, receiverId: facility, slotId: small.id, tonnesT: 3 }]);
    const cancelledHold = (await provider('/api/dataset')).dataset.bookings.at(-1);
    await act(provider, 'cancelBookingAction', [{ bookingId: cancelledHold.id }]);
    assert.equal((await provider('/api/dataset')).dataset.bookings.at(-1).status, 'cancelled');
    await act(receiver, 'rescheduleRequestAction', [held.id, target.id], 409);
    assert.equal((await provider('/api/dataset')).dataset.bookings[0].slotId, small.id);
    await act(receiver, 'updateCapacityAction', [target.id, 5]);
    await act(receiver, 'rescheduleRequestAction', [held.id, target.id]);
    await act(receiver, 'acceptRequestAction', [held.id]);
    await act(receiver, 'createPaymentAttemptAction', [{ bookingId: held.id }]);
    for (let attempt = 0; attempt < 40 && (await receiver('/api/dataset')).dataset.payments?.find(item => item.bookingId === held.id)?.paymentStatus !== 'paid'; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await receiver('/api/dataset')).dataset.payments.find(item => item.bookingId === held.id).paymentStatus, 'paid');
    await act(provider, 'dispatchAction', [{ bookingId: held.id }]);
    await act(receiver, 'verifyAction', [{ bookingId: held.id, actualT: 2, acceptedT: 1, evidence: [] }], 400);
    await act(receiver, 'verifyAction', [{ bookingId: held.id, actualT: 2, acceptedT: 1, rejectReason: 'Contamination', evidence: [] }]);
    assert.equal((await provider('/api/dataset')).dataset.verifications[0].acceptedT, 1);
    assert.equal(recoveryFlowTotals((await provider('/api/dataset')).dataset).verified, 1);
    await act(provider, 'requestCapacityAction', [{ materialId: material.id, receiverId: facility, slotId: target.id, tonnesT: 1 }]);
    const reject = (await provider('/api/dataset')).dataset.bookings.at(-1);
    await act(receiver, 'rejectRequestAction', [reject.id]);
    assert.equal((await provider('/api/dataset')).dataset.bookings.at(-1).status, 'cancelled');
    const demand = (await act(receiver, 'addDemandAction', [{ materialType: 'concrete', requiredT: 5, period: later, location: 'Delhi' }])).result;
    await act(provider, 'addOfferAction', [{ passportId: material.id, demandId: demand.id, offeredQuantityT: 1 }]);
    let offer = (await provider('/api/dataset')).dataset.offers[0];
    await act(receiver, 'declineOfferAction', [offer.id]);
    assert.equal((await provider('/api/dataset')).dataset.offers[0].status, 'declined');
    await act(provider, 'addOfferAction', [{ passportId: material.id, demandId: demand.id, offeredQuantityT: 1 }]);
    offer = (await provider('/api/dataset')).dataset.offers[0];
    // Simulate capacity and a pending offer surviving until after their dates.
    if (process.env.GREENLOOP_TEST_POSTGRES === 'embedded') {
      await expirePostgresSlots(directory);
    } else {
    const db = new DatabaseSync(join(directory, 'greenloop.sqlite'));
    try {
      const state = JSON.parse(db.prepare('SELECT document FROM state').get().document);
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      for (const key of ['projects', 'materials', 'slots', 'allocations', 'bookings', 'verifications', 'demands', 'offers', 'events']) {
        assert.equal(new Set(state[key].map(row => row.id)).size, state[key].length, `Duplicate ${key} IDs: ${state[key].map(row => row.id).join(', ')}`);
      }
      for (const row of state.materials) assert.ok(state.projects.some(project => project.id === row.projectId));
      for (const row of state.bookings) {
        assert.ok(state.materials.some(material => material.id === row.materialId));
        assert.ok(state.slots.some(slot => slot.id === row.slotId && slot.receiverId === row.receiverId));
        assert.ok(state.allocations.some(allocation => allocation.id === row.allocationId));
      }
      for (const row of state.verifications) assert.ok(state.bookings.some(booking => booking.id === row.bookingId));
      const duplicate = { ...state.events[0] };
      state.events.push(duplicate);
      state.slots.forEach(slot => { slot.date = '2020-01-01'; });
      db.prepare('UPDATE state SET document=?').run(JSON.stringify(state));
    } finally { db.close(); }
    const repaired = (await provider('/api/dataset')).dataset.events;
    assert.equal(new Set(repaired.map(event => event.id)).size, repaired.length);
    assert.deepEqual(repaired.at(-1).subjectIds, repaired[0].subjectIds);
    assert.equal(repaired.at(-1).summary, repaired[0].summary);
    assert.equal(repaired.at(-1).at, repaired[0].at);
    assert.deepEqual((await provider('/api/dataset')).dataset.events, repaired);
    await act(provider, 'addSupportRequestAction', [{ subject: 'Historical IDs', message: 'Preserve records' }]);
    const saved = new DatabaseSync(join(directory, 'greenloop.sqlite'), { readOnly: true });
    try {
      const events = JSON.parse(saved.prepare('SELECT document FROM state').get().document).events;
      assert.equal(new Set(events.map(event => event.id)).size, events.length);
    } finally { saved.close(); }
    }
    await act(receiver, 'acceptOfferAction', [offer.id], 409);
    assert.equal((await provider('/api/dataset')).dataset.offers[0].status, 'pending');
    const noHeader = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(noHeader.status, 403);
    const badJson = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GreenLoop-Client': 'web' }, body: '{' });
    assert.equal(badJson.status, 400);
    const wrongContent = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-GreenLoop-Client': 'web' }, body: '{}' });
    assert.equal(wrongContent.status, 415);
    const profile = (await provider('/api/auth/me')).user;
    assert.equal(profile.password, undefined);
    assert.equal(profile.token, undefined);
    const routes = ['/', '/sign-in', '/sign-up', '/forgot-password', '/onboarding', '/app', '/app/explore', '/app/dashboard', '/app/projects', '/app/materials/new', `/app/materials/${material.id}`, '/app/materials', '/app/receivers', '/app/allocations', '/app/bookings', '/app/deliveries', '/app/verification', '/app/reports', '/app/market-demand', '/app/profile', '/app/support', '/app/settings', '/app/audit-trail', '/app/receiver/overview', '/app/receiver/demand', '/app/receiver/capacity', '/app/receiver/incoming-requests', '/app/receiver/deliveries', '/app/receiver/verification'];
    for (const path of routes) {
      const html = await anonymous(path);
      assert.match(html, path === '/' ? /GreenLoop/ : /<div id="root"><\/div>/);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.match(basename(directory), /^greenloop-audit-/);
    rmSync(directory, { recursive: true, force: true });
  }
});
