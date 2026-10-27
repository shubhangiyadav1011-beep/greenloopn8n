import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createBackend } from './databaseHarness.mjs';
import { acceptedOffersAwaitingBooking } from '../../shared/domain/orders.ts';

test('accepted offers stay visible before scheduling and become one capacity-checked booking', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-accepted-orders-'));
  const server = createBackend({ dataDir: directory });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const client = () => {
    let cookie = '';
    return async (path, method = 'GET', data, expected = 200) => {
      const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-GreenLoop-Client': 'web', Cookie: cookie }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const result = await response.json();
      assert.equal(response.status, expected, JSON.stringify(result));
      return result;
    };
  };
  const provider = client(), receiver = client(), outsider = client();
  const action = (request, name, args, expected = 200) => request('/actions', 'POST', { action: name, args }, expected);
  const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  try {
    await provider('/auth/register', 'POST', { email: 'accepted-provider@example.com', password: 'password123' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });
    await receiver('/auth/register', 'POST', { email: 'accepted-receiver@example.com', password: 'password123' }, 201);
    const receiverId = (await receiver('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver' })).user.receiverId;
    await outsider('/auth/register', 'POST', { email: 'accepted-outsider@example.com', password: 'password123' }, 201);
    await outsider('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver' });
    const project = (await action(provider, 'addProjectAction', [{ name: 'Brick site', location: 'Delhi', status: 'active' }])).result;
    const material = (await action(provider, 'addMaterialAction', [{ projectId: project.id, type: 'brick', quantityT: 7, quantityRangeT: [7, 7], condition: 'good', grade: 'A', confidence: 1, evidence: [] }])).result;
    const demand = (await action(receiver, 'addDemandAction', [{ materialType: 'brick', requiredT: 7, period: day(7), location: 'Delhi' }])).result;
    const offered = await action(provider, 'addOfferAction', [{ passportId: material.id, demandId: demand.id, offeredQuantityT: 7, pricePerT: 700 }]);
    const offer = offered.dataset.offers.find(item => item.demandId === demand.id);
    assert.equal(acceptedOffersAwaitingBooking(offered.dataset).length, 0);
    await action(receiver, 'acceptOfferAction', [offer.id]);
    for (const request of [provider, receiver]) {
      const dataset = (await request('/dataset')).dataset;
      assert.equal(dataset.bookings.length, 0);
      assert.deepEqual(acceptedOffersAwaitingBooking(dataset).map(item => item.id), [offer.id]);
    }
    assert.equal(acceptedOffersAwaitingBooking((await outsider('/dataset')).dataset).length, 0);
    const slot = (await action(receiver, 'addCapacityAction', [{ receiverId, date: day(2), materialType: 'brick', capacityT: 6 }])).result;
    await action(outsider, 'scheduleAcceptedOfferAction', [offer.id, slot.id], 403);
    await action(receiver, 'scheduleAcceptedOfferAction', [offer.id, slot.id], 409);
    assert.equal((await receiver('/dataset')).dataset.bookings.length, 0);
    await action(receiver, 'updateCapacityAction', [slot.id, 7]);
    const lateSlot = (await action(receiver, 'addCapacityAction', [{ receiverId, date: day(8), materialType: 'brick', capacityT: 7 }])).result;
    await action(receiver, 'scheduleAcceptedOfferAction', [offer.id, lateSlot.id], 409);
    const scheduled = (await action(receiver, 'scheduleAcceptedOfferAction', [offer.id, slot.id])).dataset;
    assert.equal(scheduled.bookings.length, 1);
    assert.equal(scheduled.bookings[0].offerId, offer.id);
    assert.equal(scheduled.bookings[0].demandId, demand.id);
    assert.equal(scheduled.bookings[0].status, 'confirmed');
    assert.ok(scheduled.bookings[0].receiverAcceptedAt);
    assert.equal(scheduled.bookings[0].agreedPricePerT, 700);
    assert.equal(scheduled.events.findLast(item => item.kind === 'offer.accepted').actor.kind, 'receiver');
    assert.equal(acceptedOffersAwaitingBooking(scheduled).length, 0);
    await action(receiver, 'scheduleAcceptedOfferAction', [offer.id, slot.id], 409);
    const stored = (await provider('/dataset')).dataset;
    assert.equal(stored.bookings.length, 1);
    const legacy = { ...stored, bookings: stored.bookings.map(item => ({ ...item, offerId: undefined, status: 'cancelled' })) };
    assert.equal(acceptedOffersAwaitingBooking(legacy).length, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});
