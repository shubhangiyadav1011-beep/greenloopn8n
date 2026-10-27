import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './databaseHarness.mjs';

const samplePdf = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCg==';

test('Demo Payment & Settlement: Checkout, simulated methods, failure retry, multi-attempt history, commission, partial refund, and disputes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-demo-payment-'));
  // Set delayMs: 10 to make webhook execution immediate in tests
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
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

  try {
    // 1. Setup Accounts
    await provider('/auth/register', 'POST', { email: 'demo-provider@example.com', password: 'password123', organization: 'Green Demolition Ltd' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'demo-receiver@example.com', password: 'password123', organization: 'Urban Recyclers Pvt' }, 201);
    const receiverFacilityId = (await receiver('/profile', 'PATCH', {
      workspaces: ['receiver'],
      activeWorkspace: 'receiver',
      location: 'Faridabad Yard, Haryana',
    })).user.receiverId;

    await outsider('/auth/register', 'POST', { email: 'outsider@example.com', password: 'password123', organization: 'Third Party' }, 201);
    await outsider('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver' });

    // 2. Publish Material Passport with pricePerT
    const surveyUpload = await provider('/uploads', 'POST', { name: 'survey.pdf', data: samplePdf }, 201);
    const project = (await action(provider, 'addProjectAction', { name: 'Metro Deconstruction', location: 'Delhi NCR', status: 'active' })).result;
    const material = (await action(provider, 'addMaterialAction', {
      projectId: project.id,
      type: 'concrete',
      quantityT: 100,
      quantityRangeT: [100, 100],
      pricePerT: 1200, // INR 1,200 per tonne
      condition: 'good',
      grade: 'A',
      confidence: 1,
      location: 'Sector 12, Noida',
      evidence: [{ kind: 'survey-sheet', label: 'Structural survey', ref: surveyUpload.ref }],
    })).result;

    // 3. Receiver Sets Capacity Slot and Requests 40 Tonnes
    const slot = (await action(receiver, 'addCapacityAction', {
      receiverId: receiverFacilityId,
      date: day(3),
      capacityT: 100,
      materialType: 'concrete',
    })).result;

    const requestResult = await action(provider, 'requestCapacityAction', {
      materialId: material.id,
      receiverId: receiverFacilityId,
      slotId: slot.id,
      tonnesT: 40,
    });
    assert.equal(requestResult.result, true);

    const receiverDataset = (await receiver('/dataset')).dataset;
    const booking = receiverDataset.bookings.find((b) => b.materialId === material.id);
    assert.ok(booking, 'Booking must exist');
    assert.equal(booking.status, 'confirmed');

    // 4. Test Lifecycle Constraint: Receiver must accept booking before payment
    await receiver('/actions', 'POST', { action: 'createPaymentAttemptAction', args: [{ bookingId: booking.id, method: 'upi' }] }, 409);

    // Accept booking
    await action(receiver, 'acceptRequestAction', booking.id);

    // 5. Server-Side Authorization:
    // Provider cannot pay for booking
    await provider('/actions', 'POST', { action: 'createPaymentAttemptAction', args: [{ bookingId: booking.id, method: 'upi' }] }, 403);
    // Outsider cannot pay for booking
    await outsider('/actions', 'POST', { action: 'createPaymentAttemptAction', args: [{ bookingId: booking.id, method: 'upi' }] }, 403);

    // 6. Test Simulation Mode: Simulate Bank Decline (Failure state)
    const failedAttempt = (await action(receiver, 'createPaymentAttemptAction', {
      bookingId: booking.id,
      method: 'card',
      simulateOutcome: 'failed',
    })).result;

    assert.ok(failedAttempt.attemptId, 'Attempt must be created');
    assert.equal(failedAttempt.amountMinor, 40 * 1200 * 100, '40 tonnes * 1200 * 100 = 4,800,000 minor units (INR 48,000)');

    // Wait for mock webhook delivery (delayMs is 10ms)
    await new Promise((res) => setTimeout(res, 50));

    const afterFailDataset = (await receiver('/dataset')).dataset;
    const failedPayment = afterFailDataset.payments.find((p) => p.attemptId === failedAttempt.attemptId);
    assert.equal(failedPayment.paymentStatus, 'failed', 'Payment status must transition to failed after webhook');

    // 7. Test Retry Flow: Receiver retries with UPI and successful outcome
    const successAttempt = (await action(receiver, 'createPaymentAttemptAction', {
      bookingId: booking.id,
      method: 'upi',
      simulateOutcome: 'captured',
    })).result;

    assert.ok(successAttempt.attemptId, 'New attempt created upon retry');
    assert.notEqual(successAttempt.attemptId, failedAttempt.attemptId, 'Must create a distinct new attempt ID');

    // Wait for webhook
    await new Promise((res) => setTimeout(res, 50));

    const afterCaptureDataset = (await receiver('/dataset')).dataset;
    // Multi-attempt history verification
    const bookingAttempts = afterCaptureDataset.payments.filter((p) => p.bookingId === booking.id);
    assert.equal(bookingAttempts.length, 2, 'History must contain both the failed and successful attempts');
    assert.equal(bookingAttempts[0].attemptId, successAttempt.attemptId, 'Latest attempt must be first');
    assert.equal(bookingAttempts[0].paymentStatus, 'paid', 'Latest attempt must be paid / escrow secured');
    assert.equal(bookingAttempts[0].payoutStatus, 'held', 'Payout must be held in escrow');
    assert.equal(bookingAttempts[1].paymentStatus, 'failed', 'Previous attempt remains recorded as failed');

    // 8. Dispatch load
    await action(provider, 'dispatchAction', { bookingId: booking.id });
    const dispatchedBooking = (await receiver('/dataset')).dataset.bookings.find((b) => b.id === booking.id);
    assert.ok(dispatchedBooking.loadRef, 'Load ref assigned');

    // 9. Delivery Arrival and Weighbridge Inspection: Partial Delivery Reconciliation
    // Receiver weighs: planned 40 tonnes, but only 30 tonnes actual accepted! 10 tonnes rejected due to rubble contamination.
    const ticketUpload = await receiver('/uploads', 'POST', { name: 'weighbridge-ticket.pdf', data: samplePdf }, 201);
    await action(receiver, 'receiveLoadAction', booking.id, 40, [{ kind: 'weighbridge-ticket', label: 'Weighbridge Gross Ticket', ref: ticketUpload.ref }]);

    const verificationRecord = (await receiver('/dataset')).dataset.verifications.find((v) => v.bookingId === booking.id);
    assert.ok(verificationRecord, 'Verification record created');

    // Verify: 30 accepted, 10 rejected
    await action(receiver, 'verifyLoadAction', verificationRecord.id, 30, 10, 'Excess silt and oversized boulders');

    // Wait for settlement webhook delivery
    await new Promise((res) => setTimeout(res, 80));

    const settledDataset = (await receiver('/dataset')).dataset;
    const settledPayment = settledDataset.payments.find((p) => p.attemptId === successAttempt.attemptId);

    // Verify financial breakdown:
    // Accepted tonnes: 30 t
    // Accepted value: 30 * 1200 * 100 = 3,600,000 minor units (INR 36,000)
    // 5% GreenLoop commission: 3,600,000 * 0.05 = 180,000 minor units (INR 1,800)
    // Net Provider Payout: 3,600,000 - 180,000 = 3,420,000 minor units (INR 34,200)
    // Buyer Partial Refund: 4,800,000 - 3,600,000 = 1,200,000 minor units (INR 12,000)
    assert.equal(settledPayment.acceptedT, 30);
    assert.equal(settledPayment.acceptedValueMinor, 3600000);
    assert.equal(settledPayment.commissionMinor, 180000);
    assert.equal(settledPayment.payoutAmountMinor, 3420000);
    assert.equal(settledPayment.refundAmountMinor, 1200000);
    assert.equal(settledPayment.payoutStatus, 'settled', 'Provider payout must transition to settled');
    assert.equal(settledPayment.refundStatus, 'refunded', 'Partial refund must transition to refunded');
    assert.ok(settledPayment.payoutReference, 'Payout transfer reference generated');

    // 10. Provider view also reflects the exact same settlement breakdown
    const providerDataset = (await provider('/dataset')).dataset;
    const providerPayment = providerDataset.payments.find((p) => p.attemptId === successAttempt.attemptId);
    assert.equal(providerPayment.payoutAmountMinor, 3420000);
    assert.equal(providerPayment.commissionMinor, 180000);
    assert.equal(providerPayment.payoutStatus, 'settled');

    // 11. Test Dispute Flow on a new booking before settlement
    // Create another booking to test dispute during transit
    const slot2 = (await action(receiver, 'addCapacityAction', {
      receiverId: receiverFacilityId,
      date: day(5),
      capacityT: 100,
      materialType: 'concrete',
    })).result;

    await action(provider, 'requestCapacityAction', {
      materialId: material.id,
      receiverId: receiverFacilityId,
      slotId: slot2.id,
      tonnesT: 20,
    });
    const booking2 = (await receiver('/dataset')).dataset.bookings.find((b) => b.slotId === slot2.id);
    await action(receiver, 'acceptRequestAction', booking2.id);
    await action(receiver, 'createPaymentAttemptAction', { bookingId: booking2.id, method: 'netbanking', simulateOutcome: 'captured' });
    await new Promise((res) => setTimeout(res, 50));
    await action(provider, 'dispatchAction', { bookingId: booking2.id });

    // Receiver disputes payment due to late / off-spec delivery
    const disputeResult = (await action(receiver, 'disputePaymentAction', { bookingId: booking2.id, reason: 'Off-spec aggregates loaded' })).result;
    assert.equal(disputeResult.paymentStatus, 'disputed');
    assert.equal(disputeResult.disputeReason, 'Off-spec aggregates loaded');

    const disputedDataset = (await receiver('/dataset')).dataset;
    const disputedPayment = disputedDataset.payments.find((p) => p.bookingId === booking2.id);
    assert.equal(disputedPayment.paymentStatus, 'disputed');
    assert.equal(disputedPayment.payoutStatus, 'disputed');
  } finally {
    server.close();
    try { rmSync(directory, { recursive: true, force: true }); } catch {}
  }
});

test('QR-based UPI Approval: Mobile payment session, phone approval, cancellation, and escrow synchronization', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-qr-upi-'));
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
  const phone = client();
  const action = (c, name, ...args) => c('/actions', 'POST', { action: name, args });
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

  try {
    await provider('/auth/register', 'POST', { email: 'qr-provider@example.com', password: 'password123', organization: 'QR Provider Ltd' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'qr-receiver@example.com', password: 'password123', organization: 'QR Receiver Corp' }, 201);
    const receiverFacilityId = (await receiver('/profile', 'PATCH', {
      workspaces: ['receiver'],
      activeWorkspace: 'receiver',
      location: 'Okhla Yard, Delhi',
    })).user.receiverId;

    const surveyUpload = await provider('/uploads', 'POST', { name: 'survey.pdf', data: samplePdf }, 201);
    const project = (await action(provider, 'addProjectAction', { name: 'Metro Phase 4', location: 'Delhi NCR', status: 'active' })).result;
    const material = (await action(provider, 'addMaterialAction', {
      projectId: project.id,
      type: 'concrete',
      quantityT: 50,
      quantityRangeT: [50, 50],
      pricePerT: 1500,
      condition: 'good',
      grade: 'A',
      confidence: 1,
      location: 'Sector 18, Noida',
      evidence: [{ kind: 'survey-sheet', label: 'Survey', ref: surveyUpload.ref }],
    })).result;

    const slot = (await action(receiver, 'addCapacityAction', {
      receiverId: receiverFacilityId,
      date: day(3),
      capacityT: 100,
      materialType: 'concrete',
    })).result;

    await action(provider, 'requestCapacityAction', {
      materialId: material.id,
      receiverId: receiverFacilityId,
      slotId: slot.id,
      tonnesT: 10,
    });
    const booking = (await receiver('/dataset')).dataset.bookings.find((b) => b.slotId === slot.id);
    await action(receiver, 'acceptRequestAction', booking.id);

    // 1. Create a QR payment session (simulateOutcome: 'manual')
    const qrAttempt = (await action(receiver, 'createPaymentAttemptAction', {
      bookingId: booking.id,
      method: 'upi',
      simulateOutcome: 'manual',
    })).result;

    assert.ok(qrAttempt.providerReference, 'Must assign provider reference');
    assert.equal(qrAttempt.paymentStatus, 'pending', 'Initial status must stay pending waiting for phone');

    // 2. Fetch session via phone (public endpoint, no auth required)
    const sessionRes = await phone(`/payments/session/${qrAttempt.providerReference}`, 'GET');
    assert.equal(sessionRes.session.reference, qrAttempt.providerReference);
    assert.equal(sessionRes.session.bookingId, booking.id);
    assert.equal(sessionRes.session.status, 'pending');
    assert.equal(sessionRes.session.isDemo, true);
    assert.equal(sessionRes.session.amountMinor, 10 * 1500 * 100);

    // 3. User cancels first on phone
    const cancelRes = await phone(`/payments/session/${qrAttempt.providerReference}/cancel`, 'POST');
    assert.equal(cancelRes.success, true);
    assert.equal(cancelRes.session.paymentStatus, 'failed');

    const checkDataset = (await receiver('/dataset')).dataset;
    const failedPayment = checkDataset.payments.find((p) => p.attemptId === qrAttempt.attemptId);
    assert.equal(failedPayment.paymentStatus, 'failed');

    // 4. Retry after cancellation: User clicks Retry Payment, generates new session and approves
    const retryAttempt = (await action(receiver, 'createPaymentAttemptAction', {
      bookingId: booking.id,
      method: 'upi',
      simulateOutcome: 'manual',
    })).result;

    assert.notEqual(retryAttempt.attemptId, qrAttempt.attemptId, 'Must create a fresh new attempt');
    assert.equal(retryAttempt.paymentStatus, 'pending');

    // 5. Approve retry attempt via phone
    const approveRes = await phone(`/payments/session/${retryAttempt.providerReference}/approve`, 'POST');
    assert.equal(approveRes.success, true);
    assert.equal(approveRes.session.paymentStatus, 'paid');
    assert.ok(approveRes.session.transactionReference.startsWith('UPI-GL-'));

    // 6. Check desktop dataset receives updated paid status
    const verifiedDataset = (await receiver('/dataset')).dataset;
    const paidPayment = verifiedDataset.payments.find((p) => p.attemptId === retryAttempt.attemptId);
    assert.equal(paidPayment.paymentStatus, 'paid', 'Status must be paid in dataset');
    assert.equal(paidPayment.payoutStatus, 'held', 'Payout must be held in escrow');
  } finally {
    server.close();
    try { rmSync(directory, { recursive: true, force: true }); } catch {}
  }
});

