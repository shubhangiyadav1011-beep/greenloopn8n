import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createBackend } from './databaseHarness.mjs';
import { acceptedOffersAwaitingBooking } from '../../shared/domain/orders.ts';

test('Phase 4: bilateral negotiation, final terms versioning, over-allocation prevention, and holding state', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-phase4-test-'));
  const server = createBackend({ dataDir: directory });
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const client = () => {
    let cookie = '';
    return async (path, method = 'GET', data, expected = 200) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-GreenLoop-Client': 'web', Cookie: cookie },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const result = (response.headers.get('content-type') ?? '').includes('application/json')
        ? await response.json()
        : await response.text();
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
      return result;
    };
  };

  const provider = client();
  const receiver = client();
  const outsider = client();
  const action = (c, name, ...args) => c('/actions', 'POST', { action: name, args });
  const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

  try {
    // 1. Setup accounts
    await provider('/auth/register', 'POST', { email: 'p4-provider@example.com', password: 'password123', organization: 'Provider Corp' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'p4-receiver@example.com', password: 'password123', organization: 'Receiver Yard' }, 201);
    const receiverId = (await receiver('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Delhi' })).user.receiverId;

    await outsider('/auth/register', 'POST', { email: 'p4-outsider@example.com', password: 'password123' }, 201);
    await outsider('/profile', 'PATCH', { workspaces: ['provider', 'receiver'], activeWorkspace: 'receiver' });

    // 2. Setup inventory and demand
    const project = (await action(provider, 'addProjectAction', { name: 'P4 Demolition', location: 'Delhi', status: 'active' })).result;
    const material = (await action(provider, 'addMaterialAction', {
      projectId: project.id,
      type: 'brick',
      quantityT: 10,
      quantityRangeT: [10, 10],
      condition: 'good',
      grade: 'A',
      confidence: 1,
      evidence: [],
      pricePerT: 1000,
    })).result;

    const demand = (await action(receiver, 'addDemandAction', {
      materialType: 'brick',
      requiredT: 8,
      period: day(14),
      location: 'Delhi',
    })).result;

    const offer = (await action(provider, 'addOfferAction', {
      passportId: material.id,
      demandId: demand.id,
      offeredQuantityT: 8,
      pricePerT: 1000,
    })).dataset.offers[0];

    // 3. Permission checks: outsider cannot participate in negotiation
    await outsider('/actions', 'POST', { action: 'sendNegotiationMessageAction', args: [offer.id, 'Unauthorized message'] }, 403);
    await outsider('/actions', 'POST', { action: 'proposeFinalTermsAction', args: [offer.id, { quantityT: 5, pricePerT: 900, destination: 'Delhi', slotId: 'unscheduled' }] }, 403);

    // 4. Chat messages work and appear in conversation
    await action(provider, 'sendNegotiationMessageAction', offer.id, 'Hello, we have 8t of bricks available.');
    await action(receiver, 'sendNegotiationMessageAction', offer.id, 'Can we negotiate on price and take 5t first?');
    const conv = (await receiver('/dataset')).dataset.negotiations.find(n => n.offerId === offer.id);
    assert.equal(conv.messages.length, 2);
    assert.equal(conv.messages[0].senderRole, 'provider');
    assert.equal(conv.messages[1].senderRole, 'receiver');

    // 5. Server-side validations on Final Terms proposal
    // Price <= 0 rejected
    await provider('/actions', 'POST', { action: 'proposeFinalTermsAction', args: [offer.id, { quantityT: 5, pricePerT: 0, destination: 'Delhi', slotId: 'unscheduled' }] }, 400);
    // Quantity > available material inventory (10t) rejected with 409
    await provider('/actions', 'POST', { action: 'proposeFinalTermsAction', args: [offer.id, { quantityT: 12, pricePerT: 900, destination: 'Delhi', slotId: 'unscheduled' }] }, 409);
    // Quantity > remaining demand (8t) rejected with 409
    await provider('/actions', 'POST', { action: 'proposeFinalTermsAction', args: [offer.id, { quantityT: 9, pricePerT: 900, destination: 'Delhi', slotId: 'unscheduled' }] }, 409);
    // Destination mismatch rejected with 409
    await provider('/actions', 'POST', { action: 'proposeFinalTermsAction', args: [offer.id, { quantityT: 5, pricePerT: 900, destination: 'Mumbai', slotId: 'unscheduled' }] }, 409);

    // 6. Final terms versioning and stale approval prevention
    // Provider proposes Version 1
    const v1 = (await action(provider, 'proposeFinalTermsAction', offer.id, { quantityT: 6, pricePerT: 950, destination: 'Delhi', slotId: 'unscheduled' })).result;
    assert.equal(v1.version, 1);
    assert.equal(v1.status, 'awaiting_receiver_approval');
    assert.ok(v1.providerApprovedAt);
    assert.equal(v1.receiverApprovedAt, undefined);

    // Provider cannot re-approve version 1
    await provider('/actions', 'POST', { action: 'approveFinalTermsAction', args: [offer.id, v1.id] }, 409);

    // Receiver counters with Version 2
    const v2 = (await action(receiver, 'proposeFinalTermsAction', offer.id, { quantityT: 5, pricePerT: 900, destination: 'Delhi', slotId: 'unscheduled' })).result;
    assert.equal(v2.version, 2);
    assert.equal(v2.status, 'awaiting_provider_approval');
    assert.ok(v2.receiverApprovedAt);
    assert.equal(v2.providerApprovedAt, undefined);

    // Stale approval: receiver cannot approve superseded Version 1
    await receiver('/actions', 'POST', { action: 'approveFinalTermsAction', args: [offer.id, v1.id] }, 409);

    // 7. Unscheduled holding state: both approve Version 2 without a slot
    // An order is created in the unscheduled holding state without a Booking record
    const approvedHolding = await action(provider, 'approveFinalTermsAction', offer.id, v2.id);
    assert.equal(approvedHolding.result.status, 'holding');

    const holdingDataset = (await receiver('/dataset')).dataset;
    const acceptedOffer = holdingDataset.offers.find(o => o.id === offer.id);
    assert.equal(acceptedOffer.status, 'accepted');
    assert.equal(acceptedOffer.agreedPricePerT, 900);
    assert.equal(acceptedOffer.offeredQuantityT, 5);
    assert.equal(holdingDataset.bookings.length, 0, 'No booking created yet while unscheduled');
    assert.deepEqual(acceptedOffersAwaitingBooking(holdingDataset).map(o => o.id), [offer.id]);

    // Closed negotiation: cannot propose new terms on an accepted/decided offer
    await provider('/actions', 'POST', { action: 'proposeFinalTermsAction', args: [offer.id, { quantityT: 5, pricePerT: 900, destination: 'Delhi', slotId: 'unscheduled' }] }, 409);

    // 8. Receiver schedules the holding order into an intake slot
    const slot = (await action(receiver, 'addCapacityAction', { receiverId, date: day(5), materialType: 'brick', capacityT: 6 })).result;
    const scheduled = (await action(receiver, 'scheduleAcceptedOfferAction', offer.id, slot.id)).dataset;
    assert.equal(scheduled.bookings.length, 1);
    const booking = scheduled.bookings[0];
    assert.equal(booking.offerId, offer.id);
    assert.equal(booking.tonnesT, 5);
    assert.equal(booking.agreedPricePerT, 900);
    assert.equal(booking.status, 'confirmed');
    assert.equal(acceptedOffersAwaitingBooking(scheduled).length, 0);

    // 9. Prevent duplicate orders
    // Trying to schedule the offer again is rejected
    await receiver('/actions', 'POST', { action: 'scheduleAcceptedOfferAction', args: [offer.id, slot.id] }, 409);
    // Trying to approve final terms again is rejected
    await provider('/actions', 'POST', { action: 'approveFinalTermsAction', args: [offer.id, v2.id] }, 409);

    // 10. Direct scheduling via Final Terms when slot is provided
    // Create new demand and offer for remaining 5t
    const demand2 = (await action(receiver, 'addDemandAction', { materialType: 'brick', requiredT: 5, period: day(14), location: 'Delhi' })).result;
    const offer2 = (await action(provider, 'addOfferAction', { passportId: material.id, demandId: demand2.id, offeredQuantityT: 5, pricePerT: 950 })).dataset.offers.find(o => o.demandId === demand2.id);
    const slot2 = (await action(receiver, 'addCapacityAction', { receiverId, date: day(6), materialType: 'brick', capacityT: 5 })).result;

    const termsWithSlot = (await action(provider, 'proposeFinalTermsAction', offer2.id, { quantityT: 5, pricePerT: 950, destination: 'Delhi', slotId: slot2.id })).result;
    const confirmedRes = await action(receiver, 'approveFinalTermsAction', offer2.id, termsWithSlot.id);
    assert.equal(confirmedRes.result.status, 'confirmed');
    assert.ok(confirmedRes.result.bookingId);

    const finalDataset = (await receiver('/dataset')).dataset;
    const secondBooking = finalDataset.bookings.find(b => b.offerId === offer2.id);
    assert.ok(secondBooking);
    assert.equal(secondBooking.status, 'confirmed');
    assert.equal(secondBooking.tonnesT, 5);
    assert.equal(secondBooking.agreedPricePerT, 950);
    assert.equal(secondBooking.agreementVersionId, termsWithSlot.id);

    // 11. Over-allocation prevention: material inventory is now fully exhausted (5t + 5t = 10t out of 10t)
    const demand3 = (await action(receiver, 'addDemandAction', { materialType: 'brick', requiredT: 2, period: day(14), location: 'Delhi' })).result;
    await provider('/actions', 'POST', { action: 'addOfferAction', args: [{ passportId: material.id, demandId: demand3.id, offeredQuantityT: 2, pricePerT: 1000 }] }, 409);
  } finally {
    await new Promise(res => server.close(res));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});
