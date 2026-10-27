import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { embeddedDatabase } from './databaseHarness.mjs';
import { createBackend } from '../src/app.mjs';
import { createMockPaymentProvider } from '../src/services/payment-provider.mock.mjs';

const samplePdf = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCg==';

const client = (server) => {
  let cookie = '';
  return async (path, method = 'GET', data = undefined, expected = 200, customHeaders = {}) => {
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/api${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-GreenLoop-Client': 'web',
      Connection: 'close',
      ...customHeaders,
    };
    if (cookie) headers.cookie = cookie;
    const response = await fetch(url, {
      method,
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (response.headers.get('set-cookie')) {
      cookie = response.headers.get('set-cookie').split(';')[0];
    }
    const result = (response.headers.get('content-type') ?? '').includes('application/json')
      ? await response.json()
      : await response.text();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
    return result;
  };
};

const close = (server) =>
  new Promise((resolve) => {
    if (!server || !server.listening) return resolve();
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    server.close(() => resolve());
  });

test('Phase 9: PostgreSQL persistence across separate instances, negotiation versioning, payments, and restart', async () => {
  const postgres = await embeddedDatabase();
  const dirA = mkdtempSync(join(tmpdir(), 'gl-phase9-a-'));
  const dirB = mkdtempSync(join(tmpdir(), 'gl-phase9-b-'));
  const dirC = mkdtempSync(join(tmpdir(), 'gl-phase9-c-'));

  const baseMock = createMockPaymentProvider({ delayMs: 60000 });
  const mockProvider = {
    ...baseMock,
    schedulePaymentResult: () => {},
    createPayout: () => 'mock_trf_p9',
    createRefund: () => 'mock_ref_p9',
  };

  const serverA = createBackend({
    dataDir: dirA,
    databaseProvider: 'postgres',
    postgres: { pool: postgres.pool, storage: postgres.storage },
    paymentProvider: mockProvider,
  });
  const serverB = createBackend({
    dataDir: dirB,
    databaseProvider: 'postgres',
    postgres: { pool: postgres.pool, storage: postgres.storage },
    paymentProvider: mockProvider,
  });
  let serverC = null;

  await new Promise((resolve) => serverA.listen(0, '127.0.0.1', resolve));
  await new Promise((resolve) => serverB.listen(0, '127.0.0.1', resolve));

  const clientA = client(serverA);
  const clientB = client(serverB);
  const actionA = (name, ...args) => clientA('/actions', 'POST', { action: name, args });
  const actionB = (name, ...args) => clientB('/actions', 'POST', { action: name, args });
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

  try {
    // 1. Instance A: Register Provider & create material passport
    const providerUser = (await clientA('/auth/register', 'POST', {
      email: 'p9-provider@example.com',
      password: 'password123',
      organization: 'GreenLoop Steel Works',
    }, 201)).user;
    await clientA('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    const project = (await actionA('addProjectAction', {
      name: 'Industrial Dismantling',
      location: 'Faridabad Industrial Area',
      status: 'active',
    })).result;

    const material = (await actionA('addMaterialAction', {
      projectId: project.id,
      type: 'steel',
      quantityT: 50,
      quantityRangeT: [50, 50],
      condition: 'good',
      grade: 'A',
      confidence: 1,
      pricePerT: 34000,
      evidence: [],
    })).result;

    // 2. Instance B: Register Receiver & publish demand
    const receiverUser = (await clientB('/auth/register', 'POST', {
      email: 'p9-receiver@example.com',
      password: 'password123',
      organization: 'Northern Rebar Fabricators',
    }, 201)).user;
    const receiverId = (await clientB('/profile', 'PATCH', {
      workspaces: ['receiver'],
      activeWorkspace: 'receiver',
      location: 'Noida Phase II',
    })).user.receiverId;

    const demand = (await actionB('addDemandAction', {
      receiverId,
      materialType: 'steel',
      requiredT: 20,
      period: day(30),
      location: 'Noida Phase II',
    })).result;

    // 3. Instance A: Provider makes an offer
    const offer = (await actionA('addOfferAction', {
      demandId: demand.id,
      offeredQuantityT: 20,
      pricePerT: 34000,
      passportId: material.id,
    })).result;

    // 4. Instance B: Receiver sends a negotiation message (stored in PostgreSQL)
    const msg = (await actionB('sendNegotiationMessageAction', offer.id, 'Can we discuss delivery schedule and bulk rate?')).result;
    assert.equal(msg.senderRole, 'receiver');
    assert.equal(msg.body, 'Can we discuss delivery schedule and bulk rate?');

    // 5. Cross-Instance Read: Instance A reads negotiation messages directly from PostgreSQL
    const datasetA = (await clientA('/dataset')).dataset;
    const negotiationA = datasetA.negotiations.find((n) => n.offerId === offer.id);
    assert.ok(negotiationA, 'Negotiation must be visible across service instances');
    assert.equal(negotiationA.messages.length, 1);
    assert.equal(negotiationA.messages[0].body, 'Can we discuss delivery schedule and bulk rate?');

    // 6. Negotiation Versioning in PostgreSQL:
    // Receiver on Instance B proposes Final Terms v1 (slot: unscheduled)
    const proposalV1 = (await actionB('proposeFinalTermsAction', offer.id, {
      quantityT: 20,
      pricePerT: 32000,
      destination: 'Noida Phase II',
      slotId: 'unscheduled',
    })).result;
    assert.equal(proposalV1.version, 1);
    assert.equal(proposalV1.status, 'awaiting_provider_approval');

    // Provider on Instance A proposes counter Final Terms v2 (target date delivery)
    const targetDate = day(10);
    const proposalV2 = (await actionA('proposeFinalTermsAction', offer.id, {
      quantityT: 20,
      pricePerT: 33000,
      destination: 'Noida Phase II',
      slotId: targetDate,
    })).result;
    assert.equal(proposalV2.version, 2);
    assert.equal(proposalV2.status, 'awaiting_receiver_approval');

    // Check direct PostgreSQL queries for proposals: v1 is superseded, v2 is active
    const pgProposals = (await postgres.database.query(
      'SELECT version, status, price_per_t FROM greenloop.final_terms_proposals WHERE offer_id=$1 ORDER BY version ASC',
      [offer.id]
    )).rows;
    assert.equal(pgProposals.length, 2);
    assert.equal(pgProposals[0].version, 1);
    assert.equal(pgProposals[0].status, 'superseded');
    assert.equal(pgProposals[1].version, 2);
    assert.equal(pgProposals[1].status, 'awaiting_receiver_approval');

    // 7. Bilateral Approvals across instances:
    // Receiver on Instance B approves proposal v2 (which was proposed by Provider on Instance A)
    // Because Provider created v2, Receiver's approval provides bilateral consent and confirms the booking.
    const recApprove = (await actionB('approveFinalTermsAction', offer.id, proposalV2.id)).result;
    assert.equal(recApprove.status, 'confirmed');
    assert.ok(recApprove.bookingId, 'Booking confirmed upon bilateral agreement');

    const bookingId = recApprove.bookingId;

    // Cross-Instance Read: Instance A observes confirmed booking immediately from PostgreSQL
    const datasetAfterConfirmA = (await clientA('/dataset')).dataset;
    const confirmedBookingA = datasetAfterConfirmA.bookings.find((b) => b.id === bookingId);
    assert.ok(confirmedBookingA, 'Instance A must observe confirmed booking created across instances');
    assert.equal(confirmedBookingA.status, 'confirmed');

    // 8. Payment Attempt in PostgreSQL:
    // Receiver on Instance B creates payment attempt for confirmed booking
    const attempt = (await actionB('createPaymentAttemptAction', { bookingId })).result;
    assert.ok(attempt.attemptId);
    assert.equal(attempt.paymentStatus, 'pending');
    assert.equal(attempt.amountMinor, 20 * 33000 * 100); // 20t * ₹33,000 = ₹660,000 = 66,000,000 paise

    // Verify row directly in PostgreSQL greenloop.payment_attempts table
    const pgAttempts = (await postgres.database.query(
      'SELECT id, booking_id, amount_minor, payment_status, currency FROM greenloop.payment_attempts WHERE id=$1',
      [attempt.attemptId]
    )).rows;
    assert.equal(pgAttempts.length, 1);
    assert.equal(Number(pgAttempts[0].amount_minor), 66000000);
    assert.equal(pgAttempts[0].payment_status, 'pending');
    assert.equal(pgAttempts[0].currency, 'INR');

    // Simulate payment webhook capture (running inside postgres.run transaction)
    const webhookPayload = {
      providerName: 'mock',
      eventId: 'evt_p9_pay_1',
      providerReference: attempt.providerReference,
      type: 'payment.captured',
      amountMinor: 66000000,
      occurredAt: new Date().toISOString(),
    };
    const signature = mockProvider.signWebhook(webhookPayload);
    await clientA('/payments/mock/webhook', 'POST', webhookPayload, 200, {
      'x-mock-provider-signature': signature,
    });

    // Check payment status updated in PostgreSQL
    const pgPaidAttempt = (await postgres.database.query(
      'SELECT payment_status, paid_at FROM greenloop.payment_attempts WHERE id=$1',
      [attempt.attemptId]
    )).rows[0];
    assert.equal(pgPaidAttempt.payment_status, 'paid');
    assert.ok(pgPaidAttempt.paid_at);

    // Verify webhook event recorded in greenloop.payment_webhook_events
    const pgWebhooks = (await postgres.database.query(
      'SELECT event_id, event_type FROM greenloop.payment_webhook_events WHERE event_id=$1',
      ['evt_p9_pay_1']
    )).rows;
    assert.equal(pgWebhooks.length, 1);
    assert.equal(pgWebhooks[0].event_type, 'payment.captured');

    // Cross-Instance: Instance B observes payment status 'paid'
    const datasetB = (await clientB('/dataset')).dataset;
    const bookingPaymentB = datasetB.payments.find((p) => p.bookingId === bookingId);
    assert.equal(bookingPaymentB?.paymentStatus, 'paid');

    // 9. Delivery Dispatch, Genuine Receipt & Partial Verification:
    await actionA('dispatchAction', { bookingId });

    // Upload genuine weighbridge ticket
    const uploadRes = await clientB('/uploads', 'POST', {
      name: 'weighbridge-ticket.pdf',
      data: samplePdf,
    }, 201);
    assert.ok(uploadRes.ref);

    await actionB('receiveLoadAction', bookingId, 20, [
      { kind: 'weighbridge-ticket', label: 'Certified Weighbridge Receipt', ref: uploadRes.ref, recordedAt: new Date().toISOString() },
    ]);

    const receipt = (await clientB('/dataset')).dataset.verifications.find((v) => v.bookingId === bookingId);
    assert.ok(receipt);

    // Partial verification: 17t accepted, 3t rejected due to surface oxidation
    await actionB('verifyLoadAction', receipt.id, 17, 3, 'Surface oxidation and rust pitting on bottom bundle');

    // Verify settlement in PostgreSQL greenloop.payment_attempts:
    // Accepted Value = 17t * ₹33k = ₹561,000 (56,100,000 paise)
    // 5% Commission = ₹28,050 (2,805,000 paise)
    // Refund = 3t * ₹33k = ₹99,000 (9,900,000 paise)
    // Payout = ₹532,950 (53,295,000 paise)
    const pgSettledAttempt = (await postgres.database.query(
      'SELECT payment_status, accepted_t, accepted_value_minor, commission_minor, refund_amount_minor, refund_status, payout_amount_minor, payout_status FROM greenloop.payment_attempts WHERE id=$1',
      [attempt.attemptId]
    )).rows[0];

    assert.equal(pgSettledAttempt.payment_status, 'adjustment');
    assert.equal(Number(pgSettledAttempt.accepted_t), 17);
    assert.equal(Number(pgSettledAttempt.accepted_value_minor), 56100000);
    assert.equal(Number(pgSettledAttempt.commission_minor), 2805000);
    assert.equal(Number(pgSettledAttempt.refund_amount_minor), 9900000);
    assert.equal(pgSettledAttempt.refund_status, 'pending');
    assert.equal(Number(pgSettledAttempt.payout_amount_minor), 53295000);
    assert.equal(pgSettledAttempt.payout_status, 'pending');

    // 10. Audit No Silent Fallback to SQLite:
    // Inspect local SQLite databases in dirA and dirB to verify that negotiations and payments did NOT write to SQLite!
    for (const dataDir of [dirA, dirB]) {
      const sqlitePath = join(dataDir, 'greenloop.sqlite');
      if (existsSync(sqlitePath)) {
        const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
        const tables = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
        if (tables.has('negotiations')) {
          const negCount = sqlite.prepare('SELECT count(*) as count FROM negotiations').get().count;
          assert.equal(Number(negCount), 0, `SQLite table 'negotiations' in ${dataDir} must be empty in PostgreSQL mode`);
        }
        if (tables.has('payment_attempts')) {
          const payCount = sqlite.prepare('SELECT count(*) as count FROM payment_attempts').get().count;
          assert.equal(Number(payCount), 0, `SQLite table 'payment_attempts' in ${dataDir} must be empty in PostgreSQL mode`);
        }
        sqlite.close();
      }
    }

    // 11. Restart Persistence Verification:
    // Close servers A and B
    await Promise.all([close(serverA), close(serverB)]);

    // Start a completely fresh Instance C against the same PostgreSQL database
    serverC = createBackend({
      dataDir: dirC,
      databaseProvider: 'postgres',
      postgres: { pool: postgres.pool, storage: postgres.storage },
      paymentProvider: mockProvider,
    });
    await new Promise((resolve) => serverC.listen(0, '127.0.0.1', resolve));

    const clientC = client(serverC);
    // Log in as provider
    await clientC('/auth/login', 'POST', {
      email: 'p9-provider@example.com',
      password: 'password123',
    });

    const datasetC = (await clientC('/dataset')).dataset;
    const reloadedNegotiation = datasetC.negotiations.find((n) => n.offerId === offer.id);
    assert.ok(reloadedNegotiation, 'Negotiations must survive server restart in PostgreSQL');
    assert.equal(reloadedNegotiation.messages.length, 1);
    assert.equal(reloadedNegotiation.proposals.length, 2);

    const reloadedBooking = datasetC.bookings.find((b) => b.id === bookingId);
    assert.ok(reloadedBooking, 'Booking must survive restart in PostgreSQL');
    assert.equal(reloadedBooking.status, 'confirmed');

    const reloadedPayment = datasetC.payments.find((p) => p.bookingId === bookingId);
    assert.ok(reloadedPayment, 'Payment records must survive restart in PostgreSQL');
    assert.equal(reloadedPayment.paymentStatus, 'adjustment');
    assert.equal(reloadedPayment.acceptedT, 17);
    assert.equal(reloadedPayment.refundAmountMinor, 9900000);

    await close(serverC);
    serverC = null;
  } finally {
    const toClose = [serverA, serverB, serverC].filter(Boolean);
    await Promise.allSettled(toClose.map(close));
    await postgres.database.close();
    try { rmSync(dirA, { recursive: true, force: true }); } catch {}
    try { rmSync(dirB, { recursive: true, force: true }); } catch {}
    try { rmSync(dirC, { recursive: true, force: true }); } catch {}
  }
});

test('Phase 9: SQLite mode independent verification', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gl-phase9-sqlite-'));
  const server = createBackend({
    dataDir: dir,
    databaseProvider: 'sqlite',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const c = client(server);
  const action = (name, ...args) => c('/actions', 'POST', { action: name, args });
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

  try {
    // Register provider
    await c('/auth/register', 'POST', {
      email: 'p9-sqlite-prov@example.com',
      password: 'password123',
      organization: 'SQLite Provider Co',
    }, 201);
    await c('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    const project = (await action('addProjectAction', {
      name: 'Timber Salvage',
      location: 'Pune',
      status: 'active',
    })).result;

    const material = (await action('addMaterialAction', {
      projectId: project.id,
      type: 'timber',
      quantityT: 15,
      quantityRangeT: [15, 15],
      condition: 'good',
      grade: 'B',
      confidence: 1,
      pricePerT: 20000,
      evidence: [],
    })).result;

    // Register receiver
    const receiverClient = client(server);
    await receiverClient('/auth/register', 'POST', {
      email: 'p9-sqlite-rec@example.com',
      password: 'password123',
      organization: 'SQLite Wood Recyclers',
    }, 201);
    const receiverId = (await receiverClient('/profile', 'PATCH', {
      workspaces: ['receiver'],
      activeWorkspace: 'receiver',
      location: 'Mumbai Suburban',
    })).user.receiverId;

    const demand = (await receiverClient('/actions', 'POST', {
      action: 'addDemandAction',
      args: [{
        receiverId,
        materialType: 'timber',
        requiredT: 10,
        period: day(15),
        location: 'Mumbai Suburban',
      }],
    })).result;

    const offer = (await action('addOfferAction', {
      demandId: demand.id,
      offeredQuantityT: 10,
      pricePerT: 20000,
      passportId: material.id,
    })).result;

    // Send negotiation message in SQLite mode
    const msg = (await receiverClient('/actions', 'POST', {
      action: 'sendNegotiationMessageAction',
      args: [offer.id, 'Hello from SQLite mode!'],
    })).result;
    assert.equal(msg.body, 'Hello from SQLite mode!');

    // Propose and approve final terms
    const proposal = (await receiverClient('/actions', 'POST', {
      action: 'proposeFinalTermsAction',
      args: [offer.id, {
        quantityT: 10,
        pricePerT: 19500,
        destination: 'Mumbai Suburban',
        slotId: day(5),
      }],
    })).result;

    // Provider approves proposal -> Bilateral confirmation
    const confirmed = (await action('approveFinalTermsAction', offer.id, proposal.id)).result;
    assert.equal(confirmed.status, 'confirmed');
    assert.ok(confirmed.bookingId);

    // Verify that SQLite database holds the records
    const sqlite = new DatabaseSync(join(dir, 'greenloop.sqlite'), { readOnly: true });
    const negRows = sqlite.prepare('SELECT * FROM negotiations WHERE offer_id=?').all(offer.id);
    assert.equal(negRows.length, 1);
    const msgRows = sqlite.prepare('SELECT * FROM negotiation_messages WHERE offer_id=?').all(offer.id);
    assert.equal(msgRows.length, 1);
    assert.equal(msgRows[0].body, 'Hello from SQLite mode!');
    sqlite.close();
  } finally {
    await close(server);
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});
