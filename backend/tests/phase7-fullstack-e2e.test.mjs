import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './databaseHarness.mjs';

const samplePdf = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCg==';

test('Phase 7 E2E Journey 1: Complete Provider-to-Receiver circular procurement, genuine evidence, partial reconciliation and payment settlement', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-p7-e2e1-'));
  const server = createBackend({ dataDir: directory });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
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
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

  try {
    // 1. Setup Accounts
    await provider('/auth/register', 'POST', { email: 'p7-provider@example.com', password: 'password123', organization: 'Apex Dismantling' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'p7-receiver@example.com', password: 'password123', organization: 'Bhiwadi Circular Yard' }, 201);
    const receiverFacilityId = (await receiver('/profile', 'PATCH', {
      workspaces: ['receiver'],
      activeWorkspace: 'receiver',
      location: 'Bhiwadi Eco-Park, Rajasthan',
    })).user.receiverId;

    assert.ok(receiverFacilityId, 'Receiver facility ID must be provisioned upon profile setup');

    // 2. Provider Uploads Genuine Survey Evidence & Publishes Material Passport
    const surveyUpload = await provider('/uploads', 'POST', {
      name: 'structural-survey-proof.pdf',
      data: samplePdf,
    }, 201);

    const project = (await action(provider, 'addProjectAction', {
      name: 'P7 Industrial Facility Deconstruction',
      location: 'Alwar, Rajasthan',
      status: 'active',
    })).result;

    const material = (await action(provider, 'addMaterialAction', {
      projectId: project.id,
      type: 'steel',
      quantityT: 40,
      quantityRangeT: [40, 40],
      condition: 'good',
      grade: 'A',
      confidence: 1,
      pricePerT: 32000,
      evidence: [{ kind: 'survey-sheet', label: 'On-site ultrasonic steel survey', ref: surveyUpload.ref }],
    })).result;

    assert.equal(material.quantityT, 40);
    assert.equal(material.pricePerT, 32000);

    // 3. Receiver Discovers Material & Publishes Demand
    const demandPeriod = day(14);
    const demand = (await action(receiver, 'addDemandAction', {
      receiverId: receiverFacilityId,
      materialType: 'steel',
      requiredT: 25,
      period: demandPeriod,
      location: 'Bhiwadi Eco-Park, Rajasthan',
      targetMaterialId: material.id,
    })).result;

    assert.equal(demand.requiredT, 25);
    assert.equal(demand.status, 'OPEN');

    // 4. Provider Submits Offer
    const offer = (await action(provider, 'addOfferAction', {
      demandId: demand.id,
      offeredQuantityT: 25,
      pricePerT: 32000,
      passportId: material.id,
    })).result;

    assert.equal(offer.status, 'pending');

    // 5. Bilateral Negotiation & Landed Cost Verification
    await receiver('/actions', 'POST', {
      action: 'sendNegotiationMessageAction',
      args: [offer.id, 'Can you confirm transit haulage to Bhiwadi Eco-Park?'],
    });

    await provider('/actions', 'POST', {
      action: 'sendNegotiationMessageAction',
      args: [offer.id, 'Yes, transit haulage is ₹550/t via dedicated flatbed trailers.'],
    });

    // Check Landed Cost Engine API
    const landedCostRes = await receiver('/landed-cost', 'POST', {
      materialId: material.id,
      receiverId: receiverFacilityId,
      quantityT: 25,
      pricePerT: 32000,
      transportCostPerT: 550,
      handlingCostPerT: 150,
    });

    assert.equal(landedCostRes.calculation.status, 'complete');
    assert.equal(landedCostRes.calculation.reusableLandedCostPerT, 32700);
    assert.equal(landedCostRes.calculation.benchmark.landedCostPerT, 65000);
    assert.equal(landedCostRes.calculation.savingsPerT, 32300);
    assert.equal(landedCostRes.calculation.totalSavings, 32300 * 25);
    assert.ok(landedCostRes.calculation.savingsPercentage > 45);

    // 6. Propose & Bilaterally Approve Final Terms
    const deliveryDate = day(5);
    const proposal = (await action(provider, 'proposeFinalTermsAction', offer.id, {
      quantityT: 25,
      pricePerT: 32000,
      destination: 'Bhiwadi Eco-Park, Rajasthan',
      slotId: deliveryDate,
    })).result;

    assert.equal(proposal.version, 1);
    assert.equal(proposal.status, 'awaiting_receiver_approval');

    // Receiver approves identical Final Terms version 1
    const approvalResult = (await action(receiver, 'approveFinalTermsAction', offer.id, proposal.id)).result;
    assert.equal(approvalResult.status, 'confirmed');
    assert.ok(approvalResult.bookingId, 'Booking must be created upon bilateral approval');

    // Verify dataset state agreement
    let dataset = (await receiver('/dataset')).dataset;
    const booking = dataset.bookings.find((b) => b.id === approvalResult.bookingId);
    assert.ok(booking);
    assert.equal(booking.status, 'confirmed');
    assert.equal(booking.tonnesT, 25);
    assert.equal(booking.agreedPricePerT, 32000);

    const updatedDemand = dataset.demands.find((d) => d.id === demand.id);
    assert.equal(updatedDemand.status, 'COVERED');
    assert.equal(updatedDemand.coveredT, 25);

    // 7. Dispatch Load
    await action(provider, 'dispatchAction', { bookingId: booking.id });
    dataset = (await provider('/dataset')).dataset;
    const dispatchedBooking = dataset.bookings.find((b) => b.id === booking.id);
    assert.ok(dispatchedBooking.loadRef, 'Load ref must be generated upon dispatch');
    const loadRef = dispatchedBooking.loadRef;

    // 8. Genuine Weighbridge Evidence & Load Receipt
    const weighbridgeUpload = await receiver('/uploads', 'POST', {
      name: 'weighbridge-scale-ticket.pdf',
      data: samplePdf,
    }, 201);

    await action(receiver, 'receiveLoadAction', booking.id, 25, [{
      kind: 'weighbridge-ticket',
      label: 'Bhiwadi Certified Scale Ticket #9021',
      ref: weighbridgeUpload.ref,
    }]);

    dataset = (await receiver('/dataset')).dataset;
    const vr = dataset.verifications.find((v) => v.bookingId === booking.id);
    assert.ok(vr);
    assert.equal(vr.status, 'pending');
    assert.equal(vr.loadRef, loadRef);
    assert.equal(vr.actualT, 25);

    // 9. Reconciliation: 22 Tonnes Accepted, 3 Tonnes Rejected
    await action(receiver, 'verifyLoadAction', vr.id, 22, 3, 'Corrosion and bent flanges on 3 beams');
    dataset = (await receiver('/dataset')).dataset;
    const verifiedVr = dataset.verifications.find((v) => v.id === vr.id);
    assert.equal(verifiedVr.status, 'verified');
    assert.equal(verifiedVr.acceptedT, 22);
    assert.equal(verifiedVr.rejectedT, 3);
    assert.equal(verifiedVr.rejectReason, 'Corrosion and bent flanges on 3 beams');

    // 10. Audit Trail Verification
    const auditEvents = dataset.events.filter((e) => e.subjectIds.includes(booking.id));
    assert.ok(auditEvents.length >= 3, 'Audit trail must contain dispatch, receipt, and verification events');
    assert.ok(auditEvents.some((e) => e.kind === 'final_terms.confirmed'));
    assert.ok(auditEvents.some((e) => e.kind === 'load.dispatched'));
    assert.ok(auditEvents.some((e) => e.kind === 'delivery.received'));
    assert.ok(auditEvents.some((e) => e.kind === 'verification.completed'));
  } finally {
    server.close();
    try { rmSync(directory, { recursive: true, force: true }); } catch {}
  }
});

test('Phase 7 E2E Journey 2: Unscheduled holding state workflow, delayed scheduling, and inventory availability constraints', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-p7-e2e2-'));
  const server = createBackend({ dataDir: directory });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
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
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

  try {
    await provider('/auth/register', 'POST', { email: 'p7-prov2@example.com', password: 'password123', organization: 'Masonry Recoveries' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'p7-rec2@example.com', password: 'password123', organization: 'Urban Aggregates' }, 201);
    const receiverId = (await receiver('/profile', 'PATCH', {
      workspaces: ['receiver'],
      activeWorkspace: 'receiver',
      location: 'Gurugram Sector 48',
    })).user.receiverId;

    const project = (await action(provider, 'addProjectAction', {
      name: 'Brick Salvage Project',
      location: 'Noida',
      status: 'active',
    })).result;

    const material = (await action(provider, 'addMaterialAction', {
      projectId: project.id,
      type: 'brick',
      quantityT: 30,
      quantityRangeT: [30, 30],
      condition: 'good',
      grade: 'B',
      confidence: 1,
      pricePerT: 3000,
      evidence: [],
    })).result;

    const demand = (await action(receiver, 'addDemandAction', {
      receiverId,
      materialType: 'brick',
      requiredT: 18,
      period: day(20),
      location: 'Gurugram Sector 48',
    })).result;

    const offer = (await action(provider, 'addOfferAction', {
      demandId: demand.id,
      offeredQuantityT: 18,
      pricePerT: 3000,
      passportId: material.id,
    })).result;

    // Both parties agree to commercial terms with unscheduled delivery (Holding State)
    const proposal = (await action(receiver, 'proposeFinalTermsAction', offer.id, {
      quantityT: 18,
      pricePerT: 3000,
      destination: 'Gurugram Sector 48',
      slotId: 'unscheduled',
    })).result;

    assert.equal(proposal.slotId, 'unscheduled');
    assert.equal(proposal.status, 'awaiting_provider_approval');

    // Provider approves
    const holdResult = (await action(provider, 'approveFinalTermsAction', offer.id, proposal.id)).result;
    assert.equal(holdResult.status, 'holding');
    assert.equal(holdResult.bookingId, undefined, 'No booking created in holding state');

    let dataset = (await receiver('/dataset')).dataset;
    const acceptedOffer = dataset.offers.find((o) => o.id === offer.id);
    assert.equal(acceptedOffer.status, 'accepted');

    // Now receiver confirms delivery availability on a specific date
    const targetDate = day(7);
    const scheduleResult = (await action(receiver, 'scheduleAcceptedOfferAction', offer.id, targetDate)).result;
    assert.equal(scheduleResult, true);

    dataset = (await receiver('/dataset')).dataset;
    const scheduledBooking = dataset.bookings.find((b) => b.offerId === offer.id || (b.demandId === demand.id && b.materialId === material.id));
    assert.ok(scheduledBooking, 'Booking must be created upon delivery confirmation');
    assert.equal(scheduledBooking.status, 'confirmed');
    assert.equal(scheduledBooking.tonnesT, 18);

    // Verify over-allocation prevention: another request for 20t on the same 30t material must fail
    await assert.rejects(
      action(receiver, 'addDemandAction', {
        receiverId,
        materialType: 'brick',
        requiredT: 20,
        period: day(20),
        location: 'Gurugram Sector 48',
        targetMaterialId: material.id,
      }),
      /exceeds this listing/i,
    );
  } finally {
    server.close();
    try { rmSync(directory, { recursive: true, force: true }); } catch {}
  }
});
