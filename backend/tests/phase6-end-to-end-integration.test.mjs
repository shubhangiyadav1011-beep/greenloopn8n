import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './databaseHarness.mjs';
import { calculateLandedCost } from '../../shared/domain/landedCost.ts';

const samplePdf = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCg==';

test('Phase 6: End-to-End Circular Procurement Journey — Project, Demand, Matching, Negotiation, Bilateral Terms, Order, Fulfilment, Weighbridge Verification & Settlement', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-p6-e2e-'));
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
    // -------------------------------------------------------------------------
    // 1. Account Setup & Workspaces
    // -------------------------------------------------------------------------
    await provider('/auth/register', 'POST', {
      email: 'p6-provider@metrodemolition.in',
      password: 'password123',
      organization: 'Metro Demolition & Infra Ltd',
    }, 201);
    await provider('/profile', 'PATCH', {
      workspaces: ['provider'],
      activeWorkspace: 'provider',
      location: 'Okhla Phase III, New Delhi',
    });

    await receiver('/auth/register', 'POST', {
      email: 'p6-receiver@greencivil.in',
      password: 'password123',
      organization: 'GreenCivil Recycled Aggregates',
    }, 201);
    const receiverProfile = (await receiver('/profile', 'PATCH', {
      workspaces: ['receiver'],
      activeWorkspace: 'receiver',
      location: 'Noida Sector 62 Eco Park, Uttar Pradesh',
    })).user;
    const receiverFacilityId = receiverProfile.receiverId;

    await outsider('/auth/register', 'POST', {
      email: 'p6-outsider@unrelated.in',
      password: 'password123',
      organization: 'Unrelated Third Party',
    }, 201);
    await outsider('/profile', 'PATCH', {
      workspaces: ['provider', 'receiver'],
      activeWorkspace: 'receiver',
    });

    // -------------------------------------------------------------------------
    // 2. Project & Material Passport Creation (Provider)
    // -------------------------------------------------------------------------
    const project = (await action(provider, 'addProjectAction', {
      name: 'South Extension Commercial Retrofit',
      location: 'South Extension II, New Delhi',
      status: 'active',
    })).result;
    assert.ok(project.id, 'Project created');

    const material = (await action(provider, 'addMaterialAction', {
      projectId: project.id,
      type: 'crushed-concrete',
      quantityT: 120,
      quantityRangeT: [110, 130],
      condition: 'good',
      grade: 'A',
      confidence: 0.95,
      pricePerT: 950,
      availableFrom: day(1),
      evidence: [
        { kind: 'site-photo', label: 'Stockpile Survey Photo', status: 'valid', notes: 'Graded recycled aggregates' },
        { kind: 'lab-report', label: 'IS 383 Sieve & Silt Test Report', status: 'valid', notes: 'Compliant silt < 3%' },
      ],
    })).result;
    assert.equal(material.quantityT, 120);
    assert.equal(material.type, 'crushed concrete');

    // -------------------------------------------------------------------------
    // 3. Receiver Requirement / Demand Setup
    // -------------------------------------------------------------------------
    const targetPeriod = day(15);
    const demand = (await action(receiver, 'addDemandAction', {
      materialType: 'crushed-concrete',
      requiredT: 80,
      period: targetPeriod,
      location: 'Noida Sector 62 Eco Park, Uttar Pradesh',
    })).result;
    assert.equal(demand.requiredT, 80);

    // Create a compatible receiving intake slot for the receiver
    const slotDate = day(7);
    const slot = (await action(receiver, 'addCapacityAction', {
      receiverId: receiverFacilityId,
      date: slotDate,
      materialType: 'crushed-concrete',
      capacityT: 100,
    })).result;
    assert.ok(slot.id, 'Receiving slot established');

    // -------------------------------------------------------------------------
    // 4. Landed-Cost Calculation & Virgin Material Comparison
    // -------------------------------------------------------------------------
    const landedCost = calculateLandedCost({
      materialType: 'crushed-concrete',
      quantityT: 80,
      pricePerT: 950,
      distanceKm: 32,
      distanceKnown: true,
      materialId: material.id,
      destination: demand.location,
    });
    assert.ok(landedCost, 'Landed cost calculated');
    assert.ok(landedCost.reusableTotalCost > 0, 'Total landed cost is positive');
    assert.ok(landedCost.virginTotalCost > landedCost.reusableTotalCost, 'Circular option delivers cost savings against virgin material benchmark');
    assert.ok(landedCost.totalSavings > 0, 'Positive savings verified');

    // -------------------------------------------------------------------------
    // 5. Initial Request / Provider Offer Setup & Negotiation Initiation
    // -------------------------------------------------------------------------
    const offerRes = await action(provider, 'addOfferAction', {
      passportId: material.id,
      demandId: demand.id,
      offeredQuantityT: 80,
      pricePerT: 950,
    });
    const offer = offerRes.result;
    assert.equal(offer.status, 'pending');

    // Verification: Conversation thread initialized
    const negotiationThread = offerRes.dataset.negotiations.find((n) => n.offerId === offer.id);
    assert.ok(negotiationThread, 'Negotiation conversation thread created');
    assert.equal(negotiationThread.proposals.length, 0, 'No proposals initially');

    // Permission Check: Outsider cannot post messages or propose terms
    await actionExpect(outsider, 403, 'sendNegotiationMessageAction', offer.id, 'Unauthorized message');
    await actionExpect(outsider, 403, 'proposeFinalTermsAction', offer.id, {
      quantityT: 50,
      pricePerT: 900,
      destination: demand.location,
      slotId: slot.id,
    });

    // Receiver and Provider exchange messages
    await action(receiver, 'sendNegotiationMessageAction', offer.id, 'Can we lock 70 t at ₹900/t delivered on our scheduled date?');
    await action(provider, 'sendNegotiationMessageAction', offer.id, 'We can do 70 t at ₹920/t to cover transportation from South Extension.');

    // -------------------------------------------------------------------------
    // 6. Final Terms Version 1 (Proposed by Receiver)
    // -------------------------------------------------------------------------
    const v1Res = await action(receiver, 'proposeFinalTermsAction', offer.id, {
      quantityT: 70,
      pricePerT: 900,
      destination: demand.location,
      slotId: slot.id,
    });
    const v1Proposal = v1Res.result;
    assert.equal(v1Proposal.version, 1);
    assert.equal(v1Proposal.quantityT, 70);
    assert.equal(v1Proposal.pricePerT, 900);
    assert.equal(v1Proposal.status, 'awaiting_provider_approval');
    assert.ok(v1Proposal.receiverApprovedAt, 'Proposer automatically signs their version');
    assert.ok(!v1Proposal.providerApprovedAt, 'Counterparty has not approved yet');

    // Check that order is NOT created yet after single-party proposal
    assert.ok(!v1Res.dataset.bookings.some((b) => b.offerId === offer.id), 'No booking before bilateral approval');

    // -------------------------------------------------------------------------
    // 7. Counteroffer Final Terms Version 2 (Countered by Provider)
    // -------------------------------------------------------------------------
    // Provider counters with ₹920/t while preserving quantity, destination, and slot timing
    const v2Res = await action(provider, 'proposeFinalTermsAction', offer.id, {
      quantityT: 70,
      pricePerT: 920,
      destination: demand.location,
      slotId: slot.id,
    });
    const v2Proposal = v2Res.result;
    assert.equal(v2Proposal.version, 2);
    assert.equal(v2Proposal.pricePerT, 920);
    assert.equal(v2Proposal.status, 'awaiting_receiver_approval');
    assert.ok(v2Proposal.providerApprovedAt, 'Provider signed V2');
    assert.ok(!v2Proposal.receiverApprovedAt, 'Receiver approval was reset by counter-terms');

    // Invalidation Verification: Previous V1 is superseded and cannot be approved
    await actionExpect(receiver, 409, 'approveFinalTermsAction', offer.id, v1Proposal.id);

    // -------------------------------------------------------------------------
    // 8. Bilateral Approval & Order Establishment
    // -------------------------------------------------------------------------
    // Receiver approves Version 2
    const bilateralApprovalRes = await action(receiver, 'approveFinalTermsAction', offer.id, v2Proposal.id);
    assert.equal(bilateralApprovalRes.result.status, 'confirmed');

    // Verify order was created with the exact agreed terms
    const confirmedBooking = bilateralApprovalRes.dataset.bookings.find((b) => b.offerId === offer.id);
    assert.ok(confirmedBooking, 'Order/Booking created upon bilateral approval');
    assert.equal(confirmedBooking.tonnesT, 70);
    assert.equal(confirmedBooking.agreedPricePerT, 920);
    assert.equal(confirmedBooking.status, 'confirmed');
    assert.equal(confirmedBooking.slotId, slot.id);

    // Duplicate Prevention / Idempotency Check:
    // Calling approveFinalTermsAction again fails because negotiation is closed and booking already exists
    await actionExpect(receiver, 409, 'approveFinalTermsAction', offer.id, v2Proposal.id);
    await actionExpect(provider, 409, 'approveFinalTermsAction', offer.id, v2Proposal.id);

    // Verify inventory committed on provider material:
    // Original was 120 t. 70 t is now booked. Remaining surplus is 50 t.
    // Attempting to book or propose 60 t on this material should now be rejected as exceeding available surplus!
    const testDemand2 = (await action(receiver, 'addDemandAction', {
      materialType: 'crushed-concrete',
      requiredT: 60,
      period: targetPeriod,
      location: 'Noida Sector 62 Eco Park, Uttar Pradesh',
    })).result;

    const offer2 = (await action(provider, 'addOfferAction', {
      passportId: material.id,
      demandId: testDemand2.id,
      offeredQuantityT: 50, // within remaining 50 t
      pricePerT: 950,
    })).result;

    // Over-allocation check: Proposing 55 t should be rejected because surplus is only 50 t!
    await actionExpect(receiver, 409, 'proposeFinalTermsAction', offer2.id, {
      quantityT: 55,
      pricePerT: 900,
      destination: testDemand2.location,
      slotId: 'unscheduled',
    });

    // -------------------------------------------------------------------------
    // 9. Fulfilment: Staging, Pickup, and Dispatch Manifest
    // -------------------------------------------------------------------------
    // Provider stages load
    await action(provider, 'updateDeliveryAction', confirmedBooking.id, 'ready');

    // Provider records pickup
    await action(provider, 'updateDeliveryAction', confirmedBooking.id, 'picked-up');

    // Provider dispatches load with manifest
    const dispatchRes = await action(provider, 'dispatchAction', {
      bookingId: confirmedBooking.id,
      driverName: 'Ramesh Singh',
      vehicleRegistration: 'DL 01 AB 4421',
      manifestRef: 'MNF-P6-2026-001',
    });
    const dispatchedBooking = dispatchRes.dataset.bookings.find((b) => b.id === confirmedBooking.id);
    assert.ok(dispatchedBooking.loadRef, 'Load ref generated upon dispatch');

    // -------------------------------------------------------------------------
    // 10. In-Transit Payment & Escrow Security
    // -------------------------------------------------------------------------
    const payment = await action(receiver, 'createPaymentAttemptAction', {
      bookingId: confirmedBooking.id,
      method: 'bank_transfer',
      simulateOutcome: 'captured',
    });
    assert.ok(payment.result?.attemptId, 'Payment attempt registered');

    // Wait for webhook callback to capture payment
    await new Promise((r) => setTimeout(r, 80));

    let currentDataset = (await receiver('/dataset')).dataset;
    const paidRecord = (currentDataset.payments || []).find((p) => p.bookingId === confirmedBooking.id);
    assert.ok(paidRecord, 'Payment recorded');
    assert.equal(paidRecord.paymentStatus, 'paid');
    assert.equal(paidRecord.payoutStatus, 'held', 'Payout held in escrow during transit');

    // -------------------------------------------------------------------------
    // 11. Receiver Intake, Weighbridge Reconciliation & Settlement Adjustment
    // -------------------------------------------------------------------------
    // Receiver uploads calibrated weighbridge ticket
    const ticketUpload = await receiver('/uploads', 'POST', {
      name: 'weighbridge_slip_70t.pdf',
      data: samplePdf,
    }, 201);
    const genuineTicket = {
      kind: 'weighbridge-ticket',
      label: 'Weighbridge Ticket',
      ref: ticketUpload.ref,
      recordedAt: new Date().toISOString(),
    };

    // Receiver records delivery intake (70.0 t received gross)
    await action(receiver, 'receiveLoadAction', confirmedBooking.id, 70.0, [genuineTicket]);

    currentDataset = (await receiver('/dataset')).dataset;
    const initialVerification = currentDataset.verifications.find((v) => v.bookingId === confirmedBooking.id);
    assert.ok(initialVerification, 'Verification record created in pending status');
    assert.equal(initialVerification.actualT, 70.0);
    assert.equal(initialVerification.status, 'pending');

    // Reconcile intake: 68 t accepted, 2 t rejected with reason
    await action(receiver, 'verifyLoadAction', initialVerification.id, 68.0, 2.0, 'Moisture and fragment deduction');

    // Wait for settlement engine webhook adjustment
    await new Promise((r) => setTimeout(r, 80));

    currentDataset = (await receiver('/dataset')).dataset;
    const verifiedRecord = currentDataset.verifications.find((v) => v.id === initialVerification.id);
    assert.ok(verifiedRecord, 'Verification record found');
    assert.equal(verifiedRecord.status, 'verified');
    assert.equal(verifiedRecord.acceptedT, 68.0);
    assert.equal(verifiedRecord.rejectedT, 2.0);
    assert.equal(verifiedRecord.rejectReason, 'Moisture and fragment deduction');

    // Verify financial settlement adjustment:
    const settledPayment = currentDataset.payments.find((p) => p.bookingId === confirmedBooking.id);
    assert.ok(settledPayment, 'Settled payment record exists');
    assert.equal(settledPayment.acceptedT, 68.0);
    assert.equal(settledPayment.payoutStatus, 'settled', 'Provider payout released for verified quantity');
    assert.equal(settledPayment.refundStatus, 'refunded', 'Partial refund issued for rejected quantity');

    // -------------------------------------------------------------------------
    // 12. Alternative Flow: Unscheduled Holding State Acceptance & Scheduling
    // -------------------------------------------------------------------------
    const brickMaterial = (await action(provider, 'addMaterialAction', {
      projectId: project.id,
      type: 'brick',
      quantityT: 30,
      quantityRangeT: [28, 32],
      condition: 'good',
      grade: 'A',
      confidence: 0.9,
      pricePerT: 1200,
      availableFrom: day(1),
      evidence: [],
    })).result;

    const holdingDemand = (await action(receiver, 'addDemandAction', {
      materialType: 'brick',
      requiredT: 20,
      period: targetPeriod,
      location: 'Noida Sector 62 Eco Park, Uttar Pradesh',
    })).result;

    const holdingOffer = (await action(provider, 'addOfferAction', {
      passportId: brickMaterial.id,
      demandId: holdingDemand.id,
      offeredQuantityT: 20,
      pricePerT: 1200,
    })).result;

    // Receiver accepts original offer into unscheduled holding state without immediate slot
    const acceptHoldingRes = await action(receiver, 'acceptOfferAction', holdingOffer.id);
    assert.ok(acceptHoldingRes, 'Offer accepted into holding state');

    // Verify it is in holding state awaiting scheduling
    const preScheduleDataset = (await receiver('/dataset')).dataset;
    assert.ok(!preScheduleDataset.bookings.some((b) => b.offerId === holdingOffer.id), 'No booking yet in holding state');

    // Create intake capacity for brick and schedule
    const brickSlot = (await action(receiver, 'addCapacityAction', {
      receiverId: receiverFacilityId,
      date: day(10),
      materialType: 'brick',
      capacityT: 25,
    })).result;

    const scheduledRes = await action(receiver, 'scheduleAcceptedOfferAction', holdingOffer.id, brickSlot.id);
    const scheduledBooking = scheduledRes.dataset.bookings.find((b) => b.offerId === holdingOffer.id);
    assert.ok(scheduledBooking, 'Scheduled booking generated from holding state');
    assert.equal(scheduledBooking.tonnesT, 20);
    assert.equal(scheduledBooking.status, 'confirmed');

  } finally {
    server.close();
  }
});
