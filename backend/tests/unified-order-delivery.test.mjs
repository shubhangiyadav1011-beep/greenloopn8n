import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './databaseHarness.mjs';

const samplePdf = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCg==';

test('Unified Order-to-Delivery: End-to-end chronological timeline, provider date proposal, receiver confirmation, dispatch prerequisites, reconciliation and settlement', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-order-delivery-'));
  const server = createBackend({ dataDir: directory, paymentOptions: { delayMs: 10 } });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const client = () => {
    let cookie = '';
    return async (path, method = 'GET', data, expected = 200) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-GreenLoop-Client': 'web', Cookie: cookie, Connection: 'close' },
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
  const actionExpect = (c, expected, name, ...args) => c('/actions', 'POST', { action: name, args }, expected);
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

  try {
    // 1. Setup Accounts
    await provider('/auth/register', 'POST', { email: 'order-provider@example.com', password: 'password123', organization: 'Metro Reclaimers Ltd' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'order-receiver@example.com', password: 'password123', organization: 'Apex Eco Processing' }, 201);
    const receiverFacilityId = (await receiver('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Whitefield Processing Facility, Bengaluru' })).user.receiverId;

    await outsider('/auth/register', 'POST', { email: 'outsider@example.com', password: 'password123', organization: 'Outsider Corp' }, 201);
    await outsider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    // 2. Provider creates Project & Material
    const proj = (await action(provider, 'addProjectAction', { name: 'Metro Civic Center Demolition', location: 'Whitefield, Bengaluru', status: 'active' })).result;
    const mat = (await action(provider, 'addMaterialAction', {
      projectId: proj.id,
      type: 'crushed-concrete',
      quantityT: 100,
      quantityRangeT: [90, 110],
      confidence: 0.9,
      condition: 'good',
      grade: 'A',
      location: 'Whitefield, Bengaluru',
      pricePerT: 1200,
      evidence: [],
      listingStatus: 'published',
    })).result;

    // 3. Receiver registers facility capacity
    const slotDate = day(3);
    const slot = (await action(receiver, 'addCapacityAction', {
      receiverId: receiverFacilityId,
      date: slotDate,
      materialType: 'crushed-concrete',
      capacityT: 80,
    })).result;

    // 4. Request Capacity & Create Booking (Order)
    await action(provider, 'requestCapacityAction', {
      materialId: mat.id,
      receiverId: receiverFacilityId,
      slotId: slot.id,
      tonnesT: 40,
    });

    let dataset = (await receiver('/dataset')).dataset;
    const booking = dataset.bookings.find((b) => b.materialId === mat.id && b.receiverId === receiverFacilityId);
    assert.ok(booking, 'Booking was created');
    assert.equal(booking.status, 'confirmed');
    assert.equal(booking.tonnesT, 40);

    // Initial receiverAcceptedAt is set from bilateral agreement or initial request
    // 5. Provider proposes a new delivery date
    const newProposedDate = day(7);
    await action(provider, 'rescheduleRequestAction', booking.id, newProposedDate);

    dataset = (await provider('/dataset')).dataset;
    const updatedBooking = dataset.bookings.find((b) => b.id === booking.id);
    assert.equal(updatedBooking.receiverAcceptedAt, undefined, 'Provider proposing a new date must clear receiver acceptance');
    assert.ok(dataset.slots.find((s) => s.id === updatedBooking.slotId && s.date === newProposedDate), 'Slot updated to new proposed date');

    // Outsider cannot reschedule
    await actionExpect(outsider, 403, 'rescheduleRequestAction', booking.id, day(8));

    // 6. Workflow Rule: Dispatch is BLOCKED until receiver availability is confirmed
    await actionExpect(provider, 409, 'dispatchAction', { bookingId: booking.id });

    // 7. Receiver confirms delivery availability
    await action(receiver, 'acceptRequestAction', booking.id);
    dataset = (await receiver('/dataset')).dataset;
    assert.ok(dataset.bookings.find((b) => b.id === booking.id).receiverAcceptedAt, 'Receiver confirmed availability');

    // 8. Fulfilment readiness stages
    await action(provider, 'updateDeliveryAction', booking.id, 'ready');
    await action(provider, 'updateDeliveryAction', booking.id, 'picked-up');

    // 9. Provider uploads genuine dispatch document and dispatches load
    const uploadRes = await provider('/uploads', 'POST', {
      name: 'consignment_note_101.pdf',
      data: samplePdf,
    }, 201);
    assert.ok(uploadRes.ref, 'Dispatch document uploaded');

    const dispatchDoc = {
      kind: 'survey-sheet',
      label: 'Consignment Note 101',
      ref: uploadRes.ref,
      recordedAt: new Date().toISOString(),
    };

    await action(provider, 'dispatchAction', {
      bookingId: booking.id,
      documents: [dispatchDoc],
    });

    dataset = (await provider('/dataset')).dataset;
    const dispatchedBooking = dataset.bookings.find((b) => b.id === booking.id);
    assert.ok(dispatchedBooking.loadRef, 'Load ref assigned upon dispatch');
    assert.ok(dataset.events.some((e) => e.kind === 'load.dispatched' && e.subjectIds.includes(booking.id)), 'Dispatched event logged');
    assert.ok(dataset.events.some((e) => e.kind === 'load.documents-attached' && e.subjectIds.includes(booking.id)), 'Document attached event logged');

    // Duplicate dispatch transition is rejected
    await actionExpect(provider, 409, 'dispatchAction', { bookingId: booking.id });

    // 10. Demo Payment & Escrow: Receiver pays during transit
    const payment = await action(receiver, 'createPaymentAttemptAction', {
      bookingId: booking.id,
      method: 'upi',
      simulateOutcome: 'captured',
    });
    assert.ok(payment.result?.attemptId, 'Payment attempt registered');
    assert.equal(payment.result?.currency, 'INR');

    await new Promise((r) => setTimeout(r, 60));

    dataset = (await receiver('/dataset')).dataset;
    const paidPayment = (dataset.payments || []).find((p) => p.bookingId === booking.id);
    assert.ok(paidPayment, 'Payment recorded');
    assert.equal(paidPayment.paymentStatus, 'paid');
    assert.equal(paidPayment.payoutStatus, 'held', 'Provider payout held in escrow during transit');

    // 11. Receiver can dispute payment/delivery while in transit/escrow
    await action(receiver, 'disputePaymentAction', {
      bookingId: booking.id,
      reason: 'Quality certificate discrepancy on batch 101',
    });

    dataset = (await receiver('/dataset')).dataset;
    const disputedPayment = (dataset.payments || []).find((p) => p.bookingId === booking.id);
    assert.equal(disputedPayment.paymentStatus, 'disputed');
    assert.equal(disputedPayment.disputeReason, 'Quality certificate discrepancy on batch 101');

    // 12. Receiver Delivery Arrival: Rejects fake weighbridge tickets
    const fakeTicket = {
      kind: 'weighbridge-ticket',
      label: 'fake.pdf',
      ref: '/api/uploads/fake-uuid-not-existing',
      recordedAt: new Date().toISOString(),
    };
    await actionExpect(receiver, 400, 'receiveLoadAction', booking.id, 40.0, [fakeTicket]);

    // Receiver uploads genuine weighbridge ticket
    const ticketUpload = await receiver('/uploads', 'POST', {
      name: 'weighbridge_slip_40t.pdf',
      data: samplePdf,
    }, 201);
    const genuineTicket = {
      kind: 'weighbridge-ticket',
      label: 'Weighbridge Slip',
      ref: ticketUpload.ref,
      recordedAt: new Date().toISOString(),
    };

    // Receive load
    await action(receiver, 'receiveLoadAction', booking.id, 40.0, [genuineTicket]);
    dataset = (await receiver('/dataset')).dataset;
    const verification = dataset.verifications.find((v) => v.bookingId === booking.id);
    assert.ok(verification, 'Verification record created in pending state');
    assert.equal(verification.actualT, 40.0);
    assert.equal(verification.status, 'pending');

    // 13. Workflow Rule: Quantity Reconciliation
    // Accepted + rejected must equal received weight (40.0 t)
    // 35 accepted + 10 rejected = 45 != 40 -> MUST FAIL (400)
    await actionExpect(receiver, 400, 'verifyLoadAction', verification.id, 35.0, 10.0, 'Discrepancy');

    // Rejected quantity requires a reason
    await actionExpect(receiver, 400, 'verifyLoadAction', verification.id, 35.0, 5.0, '');

    // Valid reconciliation: 35.0 accepted, 5.0 rejected with explicit reason
    await action(receiver, 'verifyLoadAction', verification.id, 35.0, 5.0, 'Subgrade stone contamination in bottom layer');

    dataset = (await receiver('/dataset')).dataset;
    const verifiedRecord = dataset.verifications.find((v) => v.id === verification.id);
    assert.equal(verifiedRecord.status, 'verified');
    assert.equal(verifiedRecord.acceptedT, 35.0);
    assert.equal(verifiedRecord.rejectedT, 5.0);
    assert.equal(verifiedRecord.rejectReason, 'Subgrade stone contamination in bottom layer');

    // 14. Receiver Inventory Check: Only accepted quantity (35t) is credited
    const receiverVerifications = dataset.verifications.filter((v) => v.receiverId === receiverFacilityId && v.status === 'verified');
    const acceptedTotal = receiverVerifications.reduce((sum, v) => sum + v.acceptedT, 0);
    assert.equal(acceptedTotal, 35.0, 'Only accepted 35t entered receiver inventory');
  } finally {
    server.close();
    try { rmSync(directory, { recursive: true, force: true }); } catch {}
  }
});
