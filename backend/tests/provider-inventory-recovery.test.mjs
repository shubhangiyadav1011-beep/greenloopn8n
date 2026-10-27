import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './databaseHarness.mjs';

test('Provider Inventory & Asset Recovery: Ledger metrics, partial allocations, over-allocation guard, listing lifecycle, and bulk import', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-inventory-'));
  let server = createBackend({ dataDir: directory });
  let base;
  const listen = async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const client = () => {
    let cookie = '';
    return async (path, method = 'GET', data, expected = 200) => {
      const response = await fetch(`${base}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-GreenLoop-Client': 'web', Cookie: cookie },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const result = await response.json();
      assert.equal(response.status, expected, JSON.stringify(result));
      return result;
    };
  };

  const provider = client();
  const receiver1 = client();
  const receiver2 = client();
  const outsider = client();
  const act = (request, action, args, expected = 200) => request('/actions', 'POST', { action, args }, expected);
  const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

  try {
    await listen();

    // 1. Setup accounts
    await provider('/auth/register', 'POST', { email: 'inv-provider@example.com', password: 'password123', organization: 'Metro Reclaimers' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver1('/auth/register', 'POST', { email: 'inv-receiver1@example.com', password: 'password123', organization: 'Yard North' }, 201);
    const facility1 = (await receiver1('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Delhi North' })).user.receiverId;

    await receiver2('/auth/register', 'POST', { email: 'inv-receiver2@example.com', password: 'password123', organization: 'Yard South' }, 201);
    const facility2 = (await receiver2('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Delhi South' })).user.receiverId;

    await outsider('/auth/register', 'POST', { email: 'inv-outsider@example.com', password: 'password123' }, 201);
    await outsider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    // 2. Provider creates a project and an asset with 100 tonnes of concrete
    const project = (await act(provider, 'addProjectAction', [{ name: 'Metro Terminal Demolition', location: 'Delhi', status: 'active' }])).result;
    const material = (await act(provider, 'addMaterialAction', [{
      projectId: project.id,
      type: 'concrete',
      quantityT: 100,
      quantityRangeT: [90, 110],
      condition: 'good',
      grade: 'A',
      confidence: 0.95,
      pricePerT: 1200,
      evidence: [],
      listingStatus: 'published',
    }])).result;

    assert.equal(material.quantityT, 100);
    assert.equal(material.listingStatus, 'published');

    // Verify Receiver sees 100t available in providerListings
    const rec1Listings = (await receiver1('/dataset')).dataset.providerListings;
    const listingInitial = rec1Listings.find(l => l.materialId === material.id);
    assert.ok(listingInitial);
    assert.equal(listingInitial.quantityT, 100);
    assert.equal(listingInitial.availableT, 100);

    // 3. Partial Allocation 1: Allocate 30t to Receiver 1 for Date 1
    const alloc1 = (await act(provider, 'requestCapacityAction', [{
      materialId: material.id,
      receiverId: facility1,
      slotId: day(3),
      tonnesT: 30,
    }])).dataset;

    const b1 = alloc1.bookings.find(b => b.materialId === material.id && b.receiverId === facility1);
    assert.ok(b1);
    assert.equal(b1.tonnesT, 30);
    assert.equal(b1.status, 'confirmed');

    // Check available surplus in provider dataset: 100 - 30 = 70t
    const pDatasetAfterAlloc1 = (await provider('/dataset')).dataset;
    const committed1 = pDatasetAfterAlloc1.bookings.filter(b => b.materialId === material.id && b.status !== 'cancelled').reduce((s, b) => s + b.tonnesT, 0);
    assert.equal(committed1, 30);
    const available1 = material.quantityT - committed1;
    assert.equal(available1, 70);

    // Verify Receiver 2 also sees updated available surplus: 70t
    const rec2ListingsAfterAlloc1 = (await receiver2('/dataset')).dataset.providerListings;
    const listingAfterAlloc1 = rec2ListingsAfterAlloc1.find(l => l.materialId === material.id);
    assert.equal(listingAfterAlloc1.availableT, 70);

    // 4. Partial Allocation 2: Allocate 40t to Receiver 2 for Date 2 without cancelling Booking 1
    const alloc2 = (await act(provider, 'requestCapacityAction', [{
      materialId: material.id,
      receiverId: facility2,
      slotId: day(5),
      tonnesT: 40,
    }])).dataset;

    const b2 = alloc2.bookings.find(b => b.materialId === material.id && b.receiverId === facility2);
    assert.ok(b2);
    assert.equal(b2.tonnesT, 40);
    assert.equal(b2.status, 'confirmed');

    // Confirm Booking 1 is still active and valid!
    const b1StillActive = alloc2.bookings.find(b => b.id === b1.id);
    assert.ok(b1StillActive);
    assert.equal(b1StillActive.status, 'confirmed');
    assert.equal(b1StillActive.tonnesT, 30);

    // Check available surplus: 100 - (30 + 40) = 30t
    const rec2ListingsAfterAlloc2 = (await receiver2('/dataset')).dataset.providerListings;
    const listingAfterAlloc2 = rec2ListingsAfterAlloc2.find(l => l.materialId === material.id);
    assert.equal(listingAfterAlloc2.availableT, 30);

    // 5. Server-side Over-allocation Prevention
    // Attempting to allocate 35t when only 30t surplus is available must be rejected with 409
    await act(provider, 'requestCapacityAction', [{
      materialId: material.id,
      receiverId: facility1,
      slotId: day(6),
      tonnesT: 35,
    }], 409);

    // Attempting to allocate zero or negative quantity must be rejected with 400
    await act(provider, 'requestCapacityAction', [{
      materialId: material.id,
      receiverId: facility1,
      slotId: day(6),
      tonnesT: 0,
    }], 400);

    await act(provider, 'requestCapacityAction', [{
      materialId: material.id,
      receiverId: facility1,
      slotId: day(6),
      tonnesT: -5,
    }], 400);

    // 6. Listing Lifecycle Actions: Pause, Relist, Draft, Archive
    // Pause listing:
    await act(outsider, 'setMaterialListingStatusAction', [material.id, 'paused'], 403); // outsider rejected
    await act(receiver1, 'setMaterialListingStatusAction', [material.id, 'paused'], 403); // receiver rejected

    await act(provider, 'setMaterialListingStatusAction', [material.id, 'paused'], 200);

    // When paused:
    // a) Material is hidden from receiver discovery in providerListings
    const rec1ListingsWhilePaused = (await receiver1('/dataset')).dataset.providerListings;
    assert.equal(rec1ListingsWhilePaused.some(l => l.materialId === material.id), false);

    // b) Provider cannot allocate an asset while paused
    await act(provider, 'requestCapacityAction', [{
      materialId: material.id,
      receiverId: facility1,
      slotId: day(7),
      tonnesT: 10,
    }], 409);

    // Relist/publish:
    await act(provider, 'setMaterialListingStatusAction', [material.id, 'published'], 200);

    // Visible again in providerListings with remaining 30t surplus
    const rec1ListingsRelisted = (await receiver1('/dataset')).dataset.providerListings;
    const listingRelisted = rec1ListingsRelisted.find(l => l.materialId === material.id);
    assert.ok(listingRelisted);
    assert.equal(listingRelisted.availableT, 30);

    // Set to draft:
    await act(provider, 'setMaterialListingStatusAction', [material.id, 'draft'], 200);
    const rec1ListingsDraft = (await receiver1('/dataset')).dataset.providerListings;
    assert.equal(rec1ListingsDraft.some(l => l.materialId === material.id), false);

    // Set to archived:
    await act(provider, 'setMaterialListingStatusAction', [material.id, 'archived'], 200);
    const rec1ListingsArchived = (await receiver1('/dataset')).dataset.providerListings;
    assert.equal(rec1ListingsArchived.some(l => l.materialId === material.id), false);

    // Relist from archived:
    await act(provider, 'setMaterialListingStatusAction', [material.id, 'published'], 200);
    const rec1ListingsRestored = (await receiver1('/dataset')).dataset.providerListings;
    assert.ok(rec1ListingsRestored.some(l => l.materialId === material.id));

    // 7. Bulk Material Import with Row-Level Validation
    // Attempt bulk import with one invalid row (negative quantity and bad condition)
    await act(provider, 'bulkImportMaterialsAction', [[
      { projectId: project.id, type: 'brick', quantityT: 50, condition: 'good', grade: 'A' },
      { projectId: project.id, type: 'timber', quantityT: -10, condition: 'invalid-cond', grade: 'B' },
    ]], 400);

    // Non-provider cannot bulk import
    await act(receiver1, 'bulkImportMaterialsAction', [[
      { projectId: project.id, type: 'brick', quantityT: 50, condition: 'good', grade: 'A' },
    ]], 403);

    // Provider bulk imports 3 valid items across types
    const bulkResult = (await act(provider, 'bulkImportMaterialsAction', [[
      { projectId: project.id, type: 'brick', quantityT: 45, condition: 'good', grade: 'A', pricePerT: 850, surveyNotes: 'Palletized facing bricks' },
      { projectId: project.id, type: 'steel', quantityT: 25.5, condition: 'fair', grade: 'B', pricePerT: 34000, surveyNotes: 'Structural I-beams' },
      { projectId: project.id, type: 'timber', quantityT: 18, condition: 'good', grade: 'A', pricePerT: 18000, surveyNotes: 'Reclaimed joists' },
    ]])).result;

    assert.equal(bulkResult.length, 3);
    assert.equal(bulkResult[0].type, 'brick');
    assert.equal(bulkResult[0].quantityT, 45);
    assert.equal(bulkResult[1].type, 'steel');
    assert.equal(bulkResult[1].quantityT, 25.5);
    assert.equal(bulkResult[2].type, 'timber');
    assert.equal(bulkResult[2].quantityT, 18);

    // Verify all 3 appear in provider's materials
    const pDatasetFinal = (await provider('/dataset')).dataset;
    for (const item of bulkResult) {
      const found = pDatasetFinal.materials.find(m => m.id === item.id);
      assert.ok(found, `Expected ${item.id} in provider materials`);
      assert.equal(found.quantityT, item.quantityT);
      assert.equal(found.listingStatus, 'published');
    }

    // 8. Partial Cancellation Independence
    // Cancel Booking 1 (30t), Booking 2 (40t) must remain confirmed!
    await act(provider, 'cancelBookingAction', [{ bookingId: b1.id, reason: 'Logistics date adjustment' }], 200);
    const pDatasetAfterCancel = (await provider('/dataset')).dataset;
    const b1Cancelled = pDatasetAfterCancel.bookings.find(b => b.id === b1.id);
    assert.equal(b1Cancelled.status, 'cancelled');

    const b2StillActiveAfterCancel = pDatasetAfterCancel.bookings.find(b => b.id === b2.id);
    assert.equal(b2StillActiveAfterCancel.status, 'confirmed');
    assert.equal(b2StillActiveAfterCancel.tonnesT, 40);

    // Surplus becomes: 100 - 40 = 60t
    const rec2ListingsFinal = (await receiver2('/dataset')).dataset.providerListings;
    const finalListing = rec2ListingsFinal.find(l => l.materialId === material.id);
    assert.equal(finalListing.availableT, 60);

  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
