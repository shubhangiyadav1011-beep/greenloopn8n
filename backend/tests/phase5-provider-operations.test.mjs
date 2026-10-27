import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './databaseHarness.mjs';

const samplePdf = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCg==';
const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('Phase 5: Provider Operations — Asset Listing Drafts, Surplus Inventory Ledger, Allocation Safeguards, Demand Responses, and Order Fulfilment', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-p5-ops-'));
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
  const action = (c, name, ...args) => c('/actions', 'POST', { action: name, args });
  const actionExpect = (c, expected, name, ...args) => c('/actions', 'POST', { action: name, args }, expected);

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const dayAfter = new Date(Date.now() + 172800000).toISOString().slice(0, 10);

  try {
    // 0. Setup Accounts
    await provider('/auth/register', 'POST', { email: 'provider-ops@example.com', password: 'password123', organization: 'Karnataka Demolition Reclaim' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'receiver-ops@example.com', password: 'password123', organization: 'Bangalore Circular Aggregates' }, 201);
    const receiverId = (await receiver('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Whitefield Processing Facility, Bengaluru' })).user.receiverId;

    // 1. Asset Listing: Draft creation, resumption/updating, evidence attachment, and publish lifecycle
    const proj = (await action(provider, 'addProjectAction', { name: 'Hebbal Flyover Salvage', location: 'Hebbal, Bengaluru', status: 'active' })).result;

    // Create asset listing as draft
    const draftMaterial = (await action(provider, 'addMaterialAction', {
      projectId: proj.id,
      type: 'concrete',
      quantityT: 80,
      quantityRangeT: [70, 90],
      confidence: 0.9,
      condition: 'good',
      grade: 'B',
      listingStatus: 'draft',
      reusable: true,
      pricePerT: 450,
      surveyNotes: 'Initial visual survey from northern section.',
    })).result;

    assert.equal(draftMaterial.listingStatus, 'draft');
    assert.equal(draftMaterial.reusable, true);

    // Update incomplete draft without restarting (correcting quantity, grade, and notes)
    const updateRes = (await action(provider, 'updateMaterialAction', draftMaterial.id, {
      type: 'concrete',
      quantityT: 100,
      condition: 'good',
      grade: 'A',
      surveyNotes: 'Refined survey: crushed structural RCC slabs.',
      pricePerT: 500,
      availableFrom: tomorrow,
      reusable: true,
    })).result;
    assert.equal(updateRes, true);

    // Attach evidence to draft
    const photoUpload = await provider('/uploads', 'POST', { name: 'rcc_slabs.png', data: samplePng }, 201);
    const evRes = (await action(provider, 'addMaterialEvidenceAction', draftMaterial.id, {
      kind: 'site-photo',
      label: 'RCC slabs on site',
      ref: photoUpload.ref,
    })).result;
    assert.ok(evRes.evidence.length >= 1);

    // Publish draft listing
    const publishRes = (await action(provider, 'setMaterialListingStatusAction', draftMaterial.id, 'published')).result;
    assert.equal(publishRes, true);

    let dataset = (await provider('/dataset')).dataset;
    let liveMaterial = dataset.materials.find(m => m.id === draftMaterial.id);
    assert.equal(liveMaterial.listingStatus, 'published');
    assert.equal(liveMaterial.quantityT, 100);
    assert.equal(liveMaterial.grade, 'A');

    // Pause listing and resume
    await action(provider, 'setMaterialListingStatusAction', draftMaterial.id, 'paused');
    dataset = (await provider('/dataset')).dataset;
    assert.equal(dataset.materials.find(m => m.id === draftMaterial.id).listingStatus, 'paused');

    await action(provider, 'setMaterialListingStatusAction', draftMaterial.id, 'published');
    dataset = (await provider('/dataset')).dataset;
    assert.equal(dataset.materials.find(m => m.id === draftMaterial.id).listingStatus, 'published');

    // 2. Inventory Management: Available / Reserved / Committed Ledger & Over-Allocation Prevention
    // Receiver creates capacity slot
    const slot = (await action(receiver, 'addCapacityAction', { receiverId, materialType: 'concrete', date: tomorrow, capacityT: 200 })).result;

    // Partial booking: Provider allocates 40t of the 100t listing to receiver's slot
    await action(provider, 'requestCapacityAction', {
      materialId: draftMaterial.id,
      receiverId,
      slotId: slot.id,
      tonnesT: 40,
    });

    dataset = (await provider('/dataset')).dataset;
    const bookings = dataset.bookings.filter(b => b.materialId === draftMaterial.id && b.status !== 'cancelled');
    assert.equal(bookings.length, 1);
    assert.equal(bookings[0].tonnesT, 40);

    // Remaining surplus should now be 100 - 40 = 60t
    // Attempting to book 80t should be rejected with informative error stating maximum allocatable surplus
    const overAllocError = await actionExpect(provider, 409, 'requestCapacityAction', {
      materialId: draftMaterial.id,
      receiverId,
      slotId: slot.id,
      tonnesT: 80,
    });
    assert.ok(
      overAllocError.error.includes('exceeds available surplus') && overAllocError.error.includes('Maximum allocatable surplus is 60.0 t'),
      `Expected surplus feedback, got: ${overAllocError.error}`
    );

    // Valid allocation: Provider allocates within the remaining 60t (e.g., 35t)
    await action(provider, 'requestCapacityAction', {
      materialId: draftMaterial.id,
      receiverId,
      slotId: slot.id,
      tonnesT: 35,
    });

    dataset = (await provider('/dataset')).dataset;
    const activeBookings = dataset.bookings.filter(b => b.materialId === draftMaterial.id && b.status !== 'cancelled');
    assert.equal(activeBookings.length, 2);
    const totalCommitted = activeBookings.reduce((sum, b) => sum + b.tonnesT, 0);
    assert.equal(totalCommitted, 75); // 40 + 35 = 75t committed, 25t remaining surplus

    // 3. Responses to Market Demand & Duplicate Offer Prevention
    // Receiver publishes demand
    const demand = (await action(receiver, 'addDemandAction', {
      materialType: 'concrete',
      requiredT: 25,
      period: dayAfter,
      location: 'Whitefield Processing Facility, Bengaluru',
      budgetPerT: 550,
      notes: 'Need 25t Grade A recycled concrete aggregate',
    })).result;

    // Provider makes offer responding to demand using remaining 25t of the material
    const offer = (await action(provider, 'addOfferAction', {
      demandId: demand.id,
      passportId: draftMaterial.id,
      pricePerT: 500,
      offeredQuantityT: 25,
      period: dayAfter,
    })).result;
    assert.equal(offer.status, 'pending');
    assert.equal(offer.pricePerT, 500);

    // Attempting duplicate offer submission for the same material and request is rejected
    const duplicateOfferError = await actionExpect(provider, 409, 'addOfferAction', {
      demandId: demand.id,
      passportId: draftMaterial.id,
      pricePerT: 490,
      offeredQuantityT: 25,
      period: dayAfter,
    });
    assert.ok(
      duplicateOfferError.error.includes('An active offer already exists for this material and request'),
      `Expected duplicate offer prevention, got: ${duplicateOfferError.error}`
    );

    // 4. Negotiation Handoff & Bilateral Terms
    // Receiver adds capacity slot for dayAfter and accepts the offer into a confirmed booking
    const slot2 = (await action(receiver, 'addCapacityAction', { receiverId, materialType: 'concrete', date: dayAfter, capacityT: 100 })).result;
    await action(receiver, 'acceptOfferAction', offer.id, slot2.id);

    dataset = (await receiver('/dataset')).dataset;
    const acceptedOffer = dataset.offers.find(o => o.id === offer.id);
    assert.equal(acceptedOffer.status, 'accepted');

    const orderBooking = dataset.bookings.find(b => b.offerId === offer.id || (b.demandId === demand.id && b.materialId === draftMaterial.id && b.slotId === slot2.id));
    assert.ok(orderBooking, 'Expected booking created from accepted offer handoff');
    assert.equal(orderBooking.tonnesT, 25);
    assert.equal(orderBooking.agreedPricePerT, 500);

    // 5. Provider Fulfilment Milestones (Stage -> Pickup -> Dispatch)
    // Ensure receiver availability confirmation is active
    dataset = (await receiver('/dataset')).dataset;
    let currentBooking = dataset.bookings.find(b => b.id === orderBooking.id);
    if (!currentBooking.receiverAcceptedAt) {
      await action(receiver, 'acceptRequestAction', orderBooking.id);
    }

    // 5a. Provider stages cargo (delivery.ready)
    const stageRes = (await action(provider, 'updateDeliveryAction', orderBooking.id, 'ready')).result;
    assert.equal(stageRes, true);

    dataset = (await provider('/dataset')).dataset;
    assert.ok(dataset.events.some(e => e.kind === 'delivery.ready' && e.subjectIds.includes(orderBooking.id)));

    // 5b. Provider confirms haulier pickup (delivery.picked-up)
    const pickupRes = (await action(provider, 'updateDeliveryAction', orderBooking.id, 'picked-up')).result;
    assert.equal(pickupRes, true);

    dataset = (await provider('/dataset')).dataset;
    assert.ok(dataset.events.some(e => e.kind === 'delivery.picked-up' && e.subjectIds.includes(orderBooking.id)));

    // 5c. Provider dispatches load with shipping manifest document
    const manifestUpload = await provider('/uploads', 'POST', { name: 'manifest-KA04.pdf', data: samplePdf }, 201);
    await action(provider, 'dispatchAction', {
      bookingId: orderBooking.id,
      documents: [{
        kind: 'chain-of-custody',
        label: 'Consignment Note & Gate Pass',
        ref: manifestUpload.ref,
      }],
    });

    dataset = (await receiver('/dataset')).dataset;
    const dispatchedBooking = dataset.bookings.find(b => b.id === orderBooking.id);
    assert.ok(dispatchedBooking.loadRef, 'Load should have generated dispatch ref');
    assert.ok(dataset.events.some(e => e.kind === 'load.dispatched' && e.subjectIds.includes(orderBooking.id)));

    // 6. Receiver intake and delivery verification
    const weighbridgeTicket = await receiver('/uploads', 'POST', { name: 'weighbridge-in.pdf', data: samplePdf }, 201);
    await action(receiver, 'receiveLoadAction', orderBooking.id, 25, [{
      kind: 'weighbridge-ticket',
      label: 'Apex Weighbridge Net 25.0t',
      ref: weighbridgeTicket.ref,
    }]);

    dataset = (await receiver('/dataset')).dataset;
    const verification = dataset.verifications.find(v => v.bookingId === orderBooking.id);
    assert.ok(verification, 'Verification record should be created');
    assert.equal(verification.status, 'pending');

    await action(receiver, 'verifyLoadAction', verification.id, 25, 0);

    dataset = (await provider('/dataset')).dataset;
    const verifiedRecord = dataset.verifications.find(v => v.bookingId === orderBooking.id);
    assert.equal(verifiedRecord.status, 'verified');
    assert.equal(verifiedRecord.acceptedT, 25);
  } finally {
    await new Promise((res) => server.close(res));
    rmSync(directory, { recursive: true, force: true });
  }
});
