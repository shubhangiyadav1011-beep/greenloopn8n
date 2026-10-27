import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createBackend } from './databaseHarness.mjs';
import { acceptedOffersAwaitingBooking } from '../../shared/domain/orders.ts';

const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=';

test('receipt evidence integrity: rejects missing, empty, or un-referenced tickets; rejects fabricated or unauthorized references; accepts genuine uploaded evidence; prevents premature verification', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-evidence-test-'));
  const server = createBackend({ dataDir: directory, paymentOptions: { delayMs: 10 } });
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

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  try {
    // 1. Setup accounts
    await provider('/auth/register', 'POST', { email: 'provider-evidence@example.com', password: 'password123' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'receiver-evidence@example.com', password: 'password123' }, 201);
    const receiverId = (await receiver('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Delhi' })).user.receiverId;

    await outsider('/auth/register', 'POST', { email: 'outsider-evidence@example.com', password: 'password123' }, 201);
    await outsider('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver' });

    // 2. Setup inventory and booking
    const project = (await action(provider, 'addProjectAction', { name: 'Demo Site', location: 'Delhi', status: 'active' })).result;
    const material = (await action(provider, 'addMaterialAction', {
      projectId: project.id,
      type: 'concrete',
      quantityT: 10,
      quantityRangeT: [10, 10],
      condition: 'good',
      grade: 'A',
      confidence: 1,
      evidence: [],
      pricePerT: 1200,
    })).result;

    const slot = (await action(receiver, 'addCapacityAction', { receiverId, date: tomorrow, materialType: 'concrete', capacityT: 10 })).result;

    const bookingRes = await action(provider, 'requestCapacityAction', { materialId: material.id, receiverId, slotId: slot.id, tonnesT: 8 });
    const booking = bookingRes.dataset.bookings[0];
    assert.equal(booking.status, 'confirmed');

    // Accept booking and progress delivery to arrived
    await action(receiver, 'acceptRequestAction', booking.id);
    await action(receiver, 'createPaymentAttemptAction', { bookingId: booking.id });
    await action(provider, 'updateDeliveryAction', booking.id, 'ready');
    await action(provider, 'updateDeliveryAction', booking.id, 'picked-up');
    await action(provider, 'dispatchAction', { bookingId: booking.id });
    await action(provider, 'updateDeliveryAction', booking.id, 'arrived');

    // 3. Test: Missing mandatory weighbridge ticket
    // Empty evidence list
    await receiver('/actions', 'POST', { action: 'receiveLoadAction', args: [booking.id, 8, []] }, 400);

    // Other evidence kinds only (no weighbridge-ticket)
    const receiverSitePhoto = await receiver('/uploads', 'POST', { name: 'site.png', data: samplePng }, 201);
    await receiver('/actions', 'POST', {
      action: 'receiveLoadAction',
      args: [booking.id, 8, [{ kind: 'site-photo', label: 'Site Photo', ref: receiverSitePhoto.ref }]],
    }, 400);

    // Weighbridge ticket with missing ref
    await receiver('/actions', 'POST', {
      action: 'receiveLoadAction',
      args: [booking.id, 8, [{ kind: 'weighbridge-ticket', label: 'Missing ref ticket' }]],
    }, 400);

    // 4. Test: Invalid or fabricated evidence references
    // Fabricated non-URL ref (e.g. booking.loadRef like the old bug)
    await receiver('/actions', 'POST', {
      action: 'receiveLoadAction',
      args: [booking.id, 8, [{ kind: 'weighbridge-ticket', label: 'Ticket', ref: 'LD-FABRICATED-123' }]],
    }, 400);

    // Fabricated upload ID that does not exist
    await receiver('/actions', 'POST', {
      action: 'receiveLoadAction',
      args: [booking.id, 8, [{ kind: 'weighbridge-ticket', label: 'Ticket', ref: '/api/uploads/00000000-0000-0000-0000-000000000000' }]],
    }, 400);

    // Provider's upload used by receiver (wrong owner)
    const providerUpload = await provider('/uploads', 'POST', { name: 'provider.png', data: samplePng }, 201);
    await receiver('/actions', 'POST', {
      action: 'receiveLoadAction',
      args: [booking.id, 8, [{ kind: 'weighbridge-ticket', label: 'Ticket', ref: providerUpload.ref }]],
    }, 400);

    // 5. Test: Unauthorized receipt attempts
    const validTicketUpload = await receiver('/uploads', 'POST', { name: 'weighbridge.png', data: samplePng }, 201);
    const validTicketEvidence = [{ kind: 'weighbridge-ticket', label: 'Gate Scale Slip', ref: validTicketUpload.ref }];

    // Provider cannot receive load
    await provider('/actions', 'POST', { action: 'receiveLoadAction', args: [booking.id, 8, validTicketEvidence] }, 403);

    // Outsider cannot receive load
    await outsider('/actions', 'POST', { action: 'receiveLoadAction', args: [booking.id, 8, validTicketEvidence] }, 403);

    // Wrong active workspace
    await receiver('/profile', 'PATCH', { workspaces: ['receiver', 'provider'] });
    await receiver('/profile', 'PATCH', { activeWorkspace: 'provider' });
    await receiver('/actions', 'POST', { action: 'receiveLoadAction', args: [booking.id, 8, validTicketEvidence] }, 403);
    await receiver('/profile', 'PATCH', { activeWorkspace: 'receiver' });

    // Negative or zero received quantity rejected
    await receiver('/actions', 'POST', { action: 'receiveLoadAction', args: [booking.id, 0, validTicketEvidence] }, 400);
    await receiver('/actions', 'POST', { action: 'receiveLoadAction', args: [booking.id, -5, validTicketEvidence] }, 400);

    // 6. Test: Valid supplied evidence creates pending verification record
    const receiveResult = await action(receiver, 'receiveLoadAction', booking.id, 7.8, validTicketEvidence);
    const verifications = receiveResult.dataset.verifications;
    const vr = verifications.find(v => v.bookingId === booking.id);
    assert.ok(vr, 'Verification record must exist');
    assert.equal(vr.status, 'pending', 'Status must remain pending; receipt does NOT auto-verify');
    assert.equal(vr.actualT, 7.8);
    assert.equal(vr.acceptedT, 0);
    assert.equal(vr.rejectedT, 0);
    assert.equal(vr.evidence.length, 1);
    assert.equal(vr.evidence[0].kind, 'weighbridge-ticket');
    assert.equal(vr.evidence[0].ref, validTicketUpload.ref);

    // Audit event recorded
    const receiveEvent = receiveResult.dataset.events.find(e => e.kind === 'delivery.received' && e.subjectIds.includes(vr.id));
    assert.ok(receiveEvent, 'Audit event delivery.received must be logged');
    assert.equal(receiveEvent.actor.kind, 'receiver');

    // Delivery must not be marked verified yet in material or booking status
    assert.notEqual(receiveResult.dataset.materials.find(m => m.id === material.id).status, 'verified');

    // Duplicate receipt attempt rejected
    await receiver('/actions', 'POST', { action: 'receiveLoadAction', args: [booking.id, 7.8, validTicketEvidence] }, 409);

    // 7. Test: Verification validation and completion
    // Unauthorized verification attempts
    await provider('/actions', 'POST', { action: 'verifyLoadAction', args: [vr.id, 7.8, 0] }, 403);
    await outsider('/actions', 'POST', { action: 'verifyLoadAction', args: [vr.id, 7.8, 0] }, 403);

    // Accepted + rejected must equal actual received weight (7.8)
    await receiver('/actions', 'POST', { action: 'verifyLoadAction', args: [vr.id, 7.0, 0] }, 400);
    await receiver('/actions', 'POST', { action: 'verifyLoadAction', args: [vr.id, 8.0, 0] }, 400);

    // Rejection reason is mandatory when rejectedT > 0
    await receiver('/actions', 'POST', { action: 'verifyLoadAction', args: [vr.id, 7.0, 0.8, ''] }, 400);

    // Valid verification with genuine reconciliation
    const verifiedResult = await action(receiver, 'verifyLoadAction', vr.id, 7.5, 0.3, 'Excess water and fines');
    const completedVr = verifiedResult.dataset.verifications.find(v => v.id === vr.id);
    assert.equal(completedVr.status, 'verified');
    assert.equal(completedVr.acceptedT, 7.5);
    assert.equal(completedVr.rejectedT, 0.3);
    assert.equal(completedVr.rejectReason, 'Excess water and fines');
    assert.ok(completedVr.verifiedAt);

    // Material is now verified
    assert.equal(verifiedResult.dataset.materials.find(m => m.id === material.id).status, 'verified');

    // Audit event verification.completed recorded
    const verifiedEvent = verifiedResult.dataset.events.find(e => e.kind === 'verification.completed' && e.subjectIds.includes(vr.id));
    assert.ok(verifiedEvent);

    // Second verification on already verified record rejected
    await receiver('/actions', 'POST', { action: 'verifyLoadAction', args: [vr.id, 7.5, 0.3, 'Second verify'] }, 409);
  } finally {
    await new Promise(res => server.close(res));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('capacity and offer acceptance integrity: allows unscheduled holding state when no slots exist; rejects allocation conflicts and over-allocation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-capacity-test-'));
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
  const action = (c, name, ...args) => c('/actions', 'POST', { action: name, args });

  const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

  try {
    await provider('/auth/register', 'POST', { email: 'provider-cap@example.com', password: 'password123' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'receiver-cap@example.com', password: 'password123' }, 201);
    const receiverId = (await receiver('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Delhi' })).user.receiverId;

    const project = (await action(provider, 'addProjectAction', { name: 'Cap Site', location: 'Delhi', status: 'active' })).result;
    const material = (await action(provider, 'addMaterialAction', {
      projectId: project.id,
      type: 'timber',
      quantityT: 10,
      quantityRangeT: [10, 10],
      condition: 'good',
      grade: 'A',
      confidence: 1,
      evidence: [],
      pricePerT: 1500,
    })).result;

    const demand = (await action(receiver, 'addDemandAction', {
      materialType: 'timber',
      requiredT: 10,
      period: day(10),
      location: 'Delhi',
    })).result;

    // 1. Valid unscheduled offer acceptance: receiver has zero intake slots for timber
    const offer1 = (await action(provider, 'addOfferAction', {
      passportId: material.id,
      demandId: demand.id,
      offeredQuantityT: 6,
      pricePerT: 1500,
    })).dataset.offers[0];

    // Accepting without slots places offer into unscheduled holding state
    const acceptedUnscheduled = await action(receiver, 'acceptOfferAction', offer1.id);
    const updatedOffer1 = acceptedUnscheduled.dataset.offers.find(o => o.id === offer1.id);
    assert.equal(updatedOffer1.status, 'accepted');
    assert.equal(acceptedUnscheduled.dataset.bookings.length, 0, 'No booking created before scheduling');
    assert.deepEqual(acceptedOffersAwaitingBooking(acceptedUnscheduled.dataset).map(o => o.id), [offer1.id]);

    // 2. Schedule the accepted offer with capacity checking
    // Add slot with capacity smaller than offer quantity (4t < 6t)
    const smallSlot = (await action(receiver, 'addCapacityAction', { receiverId, date: day(3), materialType: 'timber', capacityT: 4 })).result;
    await receiver('/actions', 'POST', { action: 'scheduleAcceptedOfferAction', args: [offer1.id, smallSlot.id] }, 409);

    // Increase slot capacity to 6t and schedule
    await action(receiver, 'updateCapacityAction', smallSlot.id, 6);
    const scheduledRes = await action(receiver, 'scheduleAcceptedOfferAction', offer1.id, smallSlot.id);
    assert.equal(scheduledRes.dataset.bookings.length, 1);
    assert.equal(scheduledRes.dataset.bookings[0].offerId, offer1.id);
    assert.equal(scheduledRes.dataset.bookings[0].status, 'confirmed');
    assert.equal(acceptedOffersAwaitingBooking(scheduledRes.dataset).length, 0);

    // 3. Real capacity conflict on direct offer acceptance
    // Receiver now has a slot for timber (smallSlot), but its available capacity is 0 (6 capacity - 6 booked)
    const offer2 = (await action(provider, 'addOfferAction', {
      passportId: material.id,
      demandId: demand.id,
      offeredQuantityT: 4,
      pricePerT: 1500,
    })).dataset.offers.find(o => o.id !== offer1.id);

    // Direct acceptOfferAction must reject with 409 because receiver HAS slots, but none have capacity for 4t
    await receiver('/actions', 'POST', { action: 'acceptOfferAction', args: [offer2.id] }, 409);

    // Offer remains pending and no booking or held reservation was created
    const datasetAfterConflict = (await receiver('/dataset')).dataset;
    assert.equal(datasetAfterConflict.offers.find(o => o.id === offer2.id).status, 'pending');
    assert.equal(datasetAfterConflict.bookings.filter(b => b.materialId === material.id).length, 1);

    // 4. Over-allocation of remaining demand or material
    // Material only had 10t total. 6t booked. Remaining is 4t.
    // Provider cannot offer 5t (exceeds available material)
    await provider('/actions', 'POST', { action: 'addOfferAction', args: [{ passportId: material.id, demandId: demand.id, offeredQuantityT: 5 }] }, 409);
  } finally {
    await new Promise(res => server.close(res));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});
