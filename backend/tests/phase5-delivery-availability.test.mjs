import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './databaseHarness.mjs';

const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=';

test('Phase 5: receiver delivery availability, date changes, conflict protection, and partial deliveries', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-phase5-test-'));
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
  const actionExpect = (c, expected, name, ...args) => c('/actions', 'POST', { action: name, args }, expected);
  const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

  try {
    // 1. Setup accounts
    await provider('/auth/register', 'POST', { email: 'p5-provider@example.com', password: 'password123', organization: 'Provider Co' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'p5-receiver@example.com', password: 'password123', organization: 'Receiver Yard' }, 201);
    const receiverId = (await receiver('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Delhi' })).user.receiverId;

    // 2. Setup inventory and demand
    const project = (await action(provider, 'addProjectAction', { name: 'P5 Commercial Demolition', location: 'Delhi', status: 'active' })).result;
    const material = (await action(provider, 'addMaterialAction', {
      projectId: project.id,
      type: 'concrete',
      quantityT: 50,
      quantityRangeT: [50, 50],
      condition: 'good',
      grade: 'A',
      confidence: 1,
      evidence: [],
      pricePerT: 1200,
    })).result;

    const demand = (await action(receiver, 'addDemandAction', {
      materialType: 'concrete',
      requiredT: 30,
      period: day(20),
      location: 'Delhi',
      notes: 'Need clean recycled aggregate',
    })).result;

    // 3. Test: Replacing mandatory preconfigured slot with proposed delivery date
    // Provider requests capacity with a direct proposed date string (no pre-existing slot)
    const proposedDate = day(7);
    await action(provider, 'requestCapacityAction', {
      materialId: material.id,
      receiverId: receiverId,
      slotId: proposedDate,
      tonnesT: 10,
    });

    let dataset = (await receiver('/dataset')).dataset;
    const booking = dataset.bookings.find(b => b.materialId === material.id);
    assert.ok(booking, 'Booking was created with proposed delivery date');
    assert.equal(booking.status, 'confirmed');
    assert.equal(booking.receiverAcceptedAt, undefined, 'Receiver availability has not been confirmed yet');

    // Dispatch must be rejected before receiver confirms availability
    await actionExpect(provider, 409, 'dispatchAction', { bookingId: booking.id });

    // 4. Test: Unavailable Receivers validation on date change
    // Past date rejected
    await actionExpect(receiver, 400, 'rescheduleRequestAction', booking.id, '2020-01-01');
    // Date outside demand period rejected
    await actionExpect(receiver, 409, 'rescheduleRequestAction', booking.id, day(30));

    // 5. Test: Date Change / Choose Another Date
    // Receiver reschedules to day(10) directly by proposed date string
    const newDate = day(10);
    await action(receiver, 'rescheduleRequestAction', booking.id, newDate);

    dataset = (await receiver('/dataset')).dataset;
    const rescheduledBooking = dataset.bookings.find(b => b.id === booking.id);
    const newSlot = dataset.slots.find(s => s.id === rescheduledBooking.slotId);
    assert.equal(newSlot.date, newDate, 'Booking rescheduled to new date');

    // 6. Test: Confirm Availability action
    await action(receiver, 'acceptRequestAction', booking.id);
    dataset = (await receiver('/dataset')).dataset;
    const acceptedBooking = dataset.bookings.find(b => b.id === booking.id);
    assert.ok(acceptedBooking.receiverAcceptedAt, 'Receiver confirmed availability');

    // 7. Test: Conflicting Bookings — Never cancel or overwrite valid existing bookings
    // Create slot with 5 tonnes capacity on day(15)
    const conflictSlot = (await action(receiver, 'addCapacityAction', {
      receiverId: receiverId,
      date: day(15),
      materialType: 'concrete',
      capacityT: 5,
    })).result;

    // Booking 1 takes 4 tonnes on day(15)
    await action(provider, 'requestCapacityAction', {
      materialId: material.id,
      receiverId: receiverId,
      slotId: conflictSlot.id,
      tonnesT: 4,
    });
    dataset = (await receiver('/dataset')).dataset;
    const firstBooking = dataset.bookings.at(-1);
    assert.equal(firstBooking.status, 'confirmed');
    assert.equal(firstBooking.tonnesT, 4);

    // Booking 2 is requested for 3 tonnes on day(16)
    await action(provider, 'requestCapacityAction', {
      materialId: material.id,
      receiverId: receiverId,
      slotId: day(16),
      tonnesT: 3,
    });
    dataset = (await receiver('/dataset')).dataset;
    const secondBooking = dataset.bookings.at(-1);

    // Attempting to reschedule Booking 2 (3t) to day(15) (only 1t free) must fail with 409 conflict
    await actionExpect(receiver, 409, 'rescheduleRequestAction', secondBooking.id, conflictSlot.id);

    // CRITICAL REGRESSION ASSERTION: Existing booking MUST NOT be cancelled or overwritten!
    dataset = (await receiver('/dataset')).dataset;
    const firstBookingAfter = dataset.bookings.find(b => b.id === firstBooking.id);
    assert.equal(firstBookingAfter.status, 'confirmed', 'Existing valid booking must remain confirmed');
    assert.equal(firstBookingAfter.tonnesT, 4, 'Existing valid booking tonnage must remain intact');
    assert.equal(firstBookingAfter.slotId, conflictSlot.id, 'Existing valid booking slot must remain intact');

    // Second booking also remains unchanged
    const secondBookingAfter = dataset.bookings.find(b => b.id === secondBooking.id);
    assert.notEqual(secondBookingAfter.slotId, conflictSlot.id, 'Conflicting booking was not rescheduled');

    // 8. Test: Partial Deliveries
    // Create a 4t capacity slot on day(18)
    const partialSlot = (await action(receiver, 'addCapacityAction', {
      receiverId: receiverId,
      date: day(18),
      materialType: 'concrete',
      capacityT: 4,
    })).result;

    // Provider requests 10t, exceeding the 4t capacity -> goes on hold
    await action(provider, 'requestCapacityAction', {
      materialId: material.id,
      receiverId: receiverId,
      slotId: partialSlot.id,
      tonnesT: 10,
    });
    dataset = (await receiver('/dataset')).dataset;
    const holdBooking = dataset.bookings.at(-1);
    assert.equal(holdBooking.status, 'hold', 'Exceeding slot capacity creates hold booking');
    assert.equal(holdBooking.tonnesT, 10);

    // Receiver accepts partial delivery of 4t
    await action(receiver, 'acceptRequestAction', holdBooking.id, 4);
    dataset = (await receiver('/dataset')).dataset;

    // Should have confirmed booking for 4t and cancelled original hold
    const confirmedPart = dataset.bookings.find(b => b.status === 'confirmed' && b.slotId === partialSlot.id && b.materialId === material.id && b.tonnesT === 4);
    assert.ok(confirmedPart, 'Partial delivery confirmed for 4 tonnes');
    assert.ok(confirmedPart.receiverAcceptedAt, 'Partial delivery has receiver acceptance timestamp');

    const cancelledPart = dataset.bookings.find(b => b.id === holdBooking.id);
    assert.equal(cancelledPart.status, 'cancelled');
    assert.match(cancelledPart.cancelledReason, /Receiver confirmed 4\.0 t; 6\.0 t remains available/);

    // Verify partial acceptance event was recorded
    const partialEvent = dataset.events.find(e => e.kind === 'request.partially-accepted');
    assert.ok(partialEvent, 'request.partially-accepted event recorded');

    // 9. Test: End-to-end delivery workflow preservation (dispatch, weighbridge, verification)
    // Dispatch confirmedPart
    await action(provider, 'dispatchAction', { bookingId: confirmedPart.id });
    dataset = (await receiver('/dataset')).dataset;
    const dispatched = dataset.bookings.find(b => b.id === confirmedPart.id);
    assert.ok(dispatched.loadRef, 'Dispatched load received load reference');

    // Receipt without genuine weighbridge ticket rejected
    await receiver('/actions', 'POST', { action: 'receiveLoadAction', args: [confirmedPart.id, 4, []] }, 400);

    // Upload genuine weighbridge ticket
    const validTicketUpload = await receiver('/uploads', 'POST', { name: 'weighbridge.png', data: samplePng }, 201);
    const validTicketEvidence = [{ kind: 'weighbridge-ticket', label: 'Gate Scale Slip', ref: validTicketUpload.ref }];

    // Record receipt with valid evidence
    await action(receiver, 'receiveLoadAction', confirmedPart.id, 4, validTicketEvidence);
    dataset = (await receiver('/dataset')).dataset;
    const vr = dataset.verifications.find(v => v.bookingId === confirmedPart.id);
    assert.ok(vr, 'Verification record created in pending state');
    assert.equal(vr.status, 'pending');

    // Verification must enforce weight balance: accepted + rejected === actual received weight
    await actionExpect(receiver, 400, 'verifyLoadAction', vr.id, 2, 1, 'Improper balance');

    // Verify load with 3.5t accepted, 0.5t rejected
    await action(receiver, 'verifyLoadAction', vr.id, 3.5, 0.5, 'Contaminated fines');
    dataset = (await receiver('/dataset')).dataset;
    const verifiedVr = dataset.verifications.find(v => v.id === vr.id);
    assert.equal(verifiedVr.status, 'verified');
    assert.equal(verifiedVr.acceptedT, 3.5);
    assert.equal(verifiedVr.rejectedT, 0.5);
  } finally {
    server.close();
    try { rmSync(directory, { recursive: true, force: true }); } catch {}
  }
});
