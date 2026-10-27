import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createBackend } from '../src/app.mjs';
import { createBackend as createTestBackend } from './databaseHarness.mjs';
import { createMockPaymentProvider } from '../src/services/payment-provider.mock.mjs';

test('dispatch is independent of payment and late payment still settles verified deliveries', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-dispatch-payment-'));
  const mock = createMockPaymentProvider({ delayMs: 5 });
  const scheduled = [];
  const server = createTestBackend({ dataDir: directory, paymentProvider: {
    ...mock,
    schedulePaymentResult(intent, deliver) { scheduled.push({ intent, deliver }); },
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const client = () => {
    let cookie = '';
    return async (path, method = 'GET', data, expected = 200) => {
      const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-GreenLoop-Client': 'web', Cookie: cookie }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const body = await response.json(); assert.equal(response.status, expected, JSON.stringify(body)); return body;
    };
  };
  const provider = client(), receiver = client();
  const action = (request, name, ...args) => request('/actions', 'POST', { action: name, args });
  let eventId = 0;
  const deliverPayment = async (entry, type) => {
    const event = { ...entry.intent, eventId: `dispatch-test-${++eventId}`, providerName: 'mock', type, occurredAt: new Date().toISOString() };
    await entry.deliver(event, mock.signWebhook(event));
  };
  try {
    await provider('/auth/register', 'POST', { email: 'dispatch-provider@example.com', password: 'password123' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'] });
    await receiver('/auth/register', 'POST', { email: 'dispatch-receiver@example.com', password: 'password123' }, 201);
    const receiverId = (await receiver('/profile', 'PATCH', { workspaces: ['receiver'] })).user.receiverId;
    const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const slot = (await action(receiver, 'addCapacityAction', { receiverId, date, materialType: 'concrete', capacityT: 20 })).result;
    const project = (await action(provider, 'addProjectAction', { name: 'Dispatch site', location: 'Delhi', status: 'active' })).result;
    for (const status of ['none', 'pending', 'failed', 'paid']) {
      const material = (await action(provider, 'addMaterialAction', { projectId: project.id, type: 'concrete', quantityT: 2, quantityRangeT: [2, 2], condition: 'good', grade: 'A', confidence: 1, pricePerT: 1000, evidence: [] })).result;
      const reserved = await action(provider, 'requestCapacityAction', { materialId: material.id, receiverId, slotId: slot.id, tonnesT: 2 });
      const booking = reserved.dataset.bookings.find(item => item.materialId === material.id);
      const dispatch = { action: 'dispatchAction', args: [{ bookingId: booking.id }] };
      await provider('/actions', 'POST', dispatch, 409);
      await action(receiver, 'acceptRequestAction', booking.id);
      await action(provider, 'updateDeliveryAction', booking.id, 'ready');
      await provider('/actions', 'POST', dispatch, 409);
      await action(provider, 'updateDeliveryAction', booking.id, 'picked-up');
      let entry;
      if (status !== 'none') {
        await action(receiver, 'createPaymentAttemptAction', { bookingId: booking.id });
        entry = scheduled.at(-1);
        if (status === 'failed') await deliverPayment(entry, 'payment.failed');
        if (status === 'paid') await deliverPayment(entry, 'payment.captured');
      }
      await receiver('/actions', 'POST', dispatch, 403);
      await action(provider, 'dispatchAction', { bookingId: booking.id });
      const dispatched = (await provider('/dataset')).dataset;
      assert.ok(dispatched.bookings.find(item => item.id === booking.id).loadRef, status);
      assert.equal(dispatched.payments.find(item => item.bookingId === booking.id)?.paymentStatus, status === 'none' ? undefined : status);
      await provider('/actions', 'POST', dispatch, 409);
      const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=';
      const ticket = await receiver('/uploads', 'POST', { name: 'ticket.png', data: png }, 201);
      await action(receiver, 'receiveLoadAction', booking.id, 2, [{ kind: 'weighbridge-ticket', label: 'Ticket', ref: ticket.ref }]);
      const verification = (await receiver('/dataset')).dataset.verifications.find(item => item.bookingId === booking.id);
      await action(receiver, 'verifyLoadAction', verification.id, 1.5, 0.5, 'Rejected portion');
      if (status === 'none' || status === 'failed') {
        // A new payment or retry must remain available after dispatch and verification.
        await provider('/actions', 'POST', { action: 'createPaymentAttemptAction', args: [{ bookingId: booking.id }] }, 403);
        await action(receiver, 'createPaymentAttemptAction', { bookingId: booking.id });
        entry = scheduled.at(-1);
      }
      if (status !== 'paid') await deliverPayment(entry, 'payment.captured');
      let payment;
      for (let attempt = 0; attempt < 100; attempt++) {
        payment = (await receiver('/dataset')).dataset.payments.find(item => item.bookingId === booking.id);
        if (payment.payoutStatus === 'settled' && payment.refundStatus === 'refunded') break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(payment.payoutStatus, 'settled', status);
      assert.equal(payment.refundStatus, 'refunded', status);
      assert.equal(payment.acceptedValueMinor, 150000);
      assert.equal(payment.refundAmountMinor, 50000);
      assert.equal(payment.payoutAmountMinor, 142500);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('auction award lets the winning receiver propose destination and slot before bilateral booking approval', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-auction-terms-'));
  const server = createBackend({ dataDir: directory, paymentProvider: createMockPaymentProvider({ delayMs: 250 }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (path, method = 'GET', data, expected = 200) => {
      const response = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-GreenLoop-Client': 'web', Cookie: cookie }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const body = await response.json(); assert.equal(response.status, expected, JSON.stringify(body)); return body;
    };
  };
  const provider = client(), receiver = client();
  const action = (request, name, ...args) => request('/actions', 'POST', { action: name, args });
  const waitFor = async (read, predicate) => {
    for (let count = 0; count < 100; count++) { const value = await read(); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.fail('Timed out waiting for mock payment verification.');
  };
  try {
    await provider('/auth/register', 'POST', { email: 'auction-provider@example.com', password: 'password123', organization: 'Auction Provider' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });
    const project = (await action(provider, 'addProjectAction', { name: 'Auction site', location: 'Pune', status: 'active' })).result;
    const material = (await action(provider, 'addMaterialAction', { projectId: project.id, type: 'concrete', quantityT: 10, quantityRangeT: [10, 10], condition: 'good', grade: 'A', confidence: 1, pricePerT: 800, evidence: [] })).result;
    await receiver('/auth/register', 'POST', { email: 'auction-receiver@example.com', password: 'password123', organization: 'Receiver Yard' }, 201);
    const receiverId = (await receiver('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Pune' })).user.receiverId;
    const slotDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const slot = (await action(receiver, 'addCapacityAction', { receiverId, date: slotDate, materialType: 'concrete', capacityT: 10 })).result;
    const startsAt = new Date(Date.now() + 1500).toISOString();
    const endsAt = new Date(Date.now() + 300000).toISOString();
    const created = await provider('/auctions', 'POST', { materialId: material.id, quantityT: 5, startsAt, endsAt, minimumIncrement: 100, reservePrice: null }, 201);
    const auctionId = created.auction.id;
    await waitFor(() => provider('/monetization/me'), value => value.attempts.some(item => item.targetId === auctionId && item.status === 'paid'));
    await waitFor(() => receiver('/auctions'), value => value.auctions.some(item => item.id === auctionId && item.status === 'open'));
    await receiver(`/auctions/${auctionId}/join`, 'POST', {});
    await waitFor(() => receiver('/monetization/me'), value => value.attempts.some(item => item.productType === 'auction_participation' && item.targetId === auctionId && item.status === 'paid'));
    const bid = await receiver(`/auctions/${auctionId}/bids`, 'POST', { amount: 500 });
    assert.equal(bid.bid.amount, 500);
    const db = new DatabaseSync(join(directory, 'greenloop.sqlite'));
    try { db.prepare('UPDATE auctions SET ends_at=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), auctionId); } finally { db.close(); }
    const awarded = (await receiver('/auctions')).auctions.find(item => item.id === auctionId);
    assert.equal(awarded.status, 'awarded');
    const offer = (await receiver('/dataset')).dataset.offers.find(item => item.auctionId === auctionId);
    assert.ok(offer);
    const proposed = (await action(receiver, 'proposeFinalTermsAction', offer.id, { quantityT: 4, pricePerT: 500, destination: 'Pune Receiver Yard, Gate 3', slotId: slot.id })).result;
    assert.equal(proposed.destination, 'Pune Receiver Yard, Gate 3');
    assert.equal((await receiver('/dataset')).dataset.bookings.some(item => item.offerId === offer.id), false);
    const confirmation = await action(provider, 'approveFinalTermsAction', offer.id, proposed.id);
    assert.equal(confirmation.result.status, 'confirmed', JSON.stringify(confirmation.result));
    const finalDataset = (await receiver('/dataset')).dataset;
    const booking = finalDataset.bookings.find(item => item.offerId === offer.id);
    assert.equal(booking.agreementVersionId, proposed.id);
    assert.equal(finalDataset.negotiations.find(item => item.offerId === offer.id).proposals.at(-1).destination, 'Pune Receiver Yard, Gate 3');
    assert.equal((await provider(`/auctions/${auctionId}`)).auction.status, 'completed');
    const sponsorable = (await action(provider, 'addMaterialAction', { projectId: project.id, type: 'brick', quantityT: 2, quantityRangeT: [2, 2], condition: 'good', grade: 'B', confidence: 1, evidence: [] })).result;
    await provider('/monetization/sponsorship', 'POST', { materialId: sponsorable.id, days: 7 }, 201);
    await action(provider, 'deleteMaterialAction', sponsorable.id);
    const refundRequired = await waitFor(() => provider('/monetization/me'), value => value.attempts.some(item => item.productType === 'sponsored_listing' && item.targetId?.startsWith(`${sponsorable.id}:`) && item.status === 'refunded'));
    assert.ok(refundRequired.attempts.some(item => item.productType === 'sponsored_listing' && item.targetId?.startsWith(`${sponsorable.id}:`) && ['refund_pending', 'refunded'].includes(item.status)));
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});
