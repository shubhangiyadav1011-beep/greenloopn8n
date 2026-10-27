import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './databaseHarness.mjs';
import {
  calculateLandedCost,
  calculateTransportCostPerT,
  COMMERCIAL_FREIGHT_RATES,
  DEFAULT_HANDLING_RATES,
  VIRGIN_MATERIAL_BENCHMARKS,
} from '../../shared/domain/landedCost.ts';
import {
  computeMaterialLedger,
  recordDelivery,
  contextualMatch,
  evaluateMatch,
} from '../../shared/domain/capacity.ts';

test('Phase 9.A: Landed-cost commercial model, units, monotonicity, and defensible savings', () => {
  // 1. Zero distance check (must return positive base mobilization, not zero or ₹2)
  const zeroDistSteel = calculateTransportCostPerT(0, 'steel');
  assert.equal(zeroDistSteel, 180, 'Base mobilization for steel at 0 km should be ₹180/t');

  const zeroDistConcrete = calculateTransportCostPerT(0, 'concrete');
  assert.equal(zeroDistConcrete, 120, 'Base mobilization for concrete at 0 km should be ₹120/t');

  // 2. Monotonic increase with distance
  const steel25km = calculateTransportCostPerT(25, 'steel');
  const steel50km = calculateTransportCostPerT(50, 'steel');
  const steel100km = calculateTransportCostPerT(100, 'steel');

  assert.ok(steel25km > zeroDistSteel, '25 km transport must exceed 0 km');
  assert.ok(steel50km > steel25km, '50 km transport must exceed 25 km');
  assert.ok(steel100km > steel50km, '100 km transport must exceed 50 km');

  // Exact tariff checks: 180 + 14 * km
  assert.equal(steel25km, 180 + 14 * 25, '25 km steel freight = ₹530/t');
  assert.equal(steel50km, 180 + 14 * 50, '50 km steel freight = ₹880/t');

  // 3. Handling rates unit consistency
  assert.ok(DEFAULT_HANDLING_RATES.steel >= 180, 'Steel handling must reflect commercial yard crane rate (>= ₹180/t)');
  assert.ok(DEFAULT_HANDLING_RATES.concrete >= 100, 'Concrete handling must reflect commercial aggregate loading rate (>= ₹100/t)');

  // 4. Missing inputs & unconfirmed distance fallback
  const missingDistCalc = calculateLandedCost({
    materialType: 'steel',
    quantityT: 20,
    pricePerT: 38000,
    distanceKm: undefined,
    distanceKnown: false,
  });
  assert.equal(missingDistCalc.isDistanceEstimated, true, 'Must flag distance as estimated');
  const transportItem = missingDistCalc.items.find((i) => i.key === 'transport');
  assert.ok(transportItem, 'Must have transport item');
  assert.equal(transportItem.isEstimated, true);
  assert.equal(transportItem.ratePerT, zeroDistSteel, 'Fallback rate should equal base mobilization');

  // 5. Defensible savings against virgin benchmarks
  const steelFullCalc = calculateLandedCost({
    materialType: 'steel',
    quantityT: 25,
    pricePerT: 38000,
    distanceKm: 25,
    distanceKnown: true,
  });
  assert.equal(steelFullCalc.status, 'complete');
  assert.ok(steelFullCalc.reusableLandedCostPerT > 38000, 'Landed cost must exceed base price');
  // Reusable logistics: 530 (transport) + 220 (handling) = 750 / t
  assert.equal(steelFullCalc.reusableLandedCostPerT, 38000 + 530 + 220);
  // Virgin steel benchmark: 65,000 / t (62,000 + 3,000 logistics)
  assert.equal(steelFullCalc.benchmark.landedCostPerT, 65000);
  // Savings: 65,000 - 38,750 = 26,250 / t -> 656,250 total
  assert.equal(steelFullCalc.savingsPerT, 26250);
  assert.ok(steelFullCalc.savingsPercentage >= 40 && steelFullCalc.savingsPercentage < 50, 'Savings should be around 40-45%');
});

test('Phase 9.B: Inventory ledger, partial deliveries, surplus preservation, and rejected quarantine', () => {
  const material = { id: 'mat-test-100', quantityT: 100 };
  const bookings = [
    {
      id: 'bk-1',
      materialId: 'mat-test-100',
      receiverId: 'rec-1',
      slotId: 'slot-1',
      tonnesT: 40,
      status: 'confirmed',
      receiverAcceptedAt: '2026-10-01T10:00:00Z',
    },
    {
      id: 'bk-2',
      materialId: 'mat-test-100',
      receiverId: 'rec-2',
      slotId: 'slot-2',
      tonnesT: 20,
      status: 'hold',
    },
  ];

  // 1. Initial Ledger: 100 total, 40 committed, 20 reserved, 40 available
  const initialLedger = computeMaterialLedger(material, bookings);
  assert.equal(initialLedger.totalT, 100);
  assert.equal(initialLedger.committedT, 40);
  assert.equal(initialLedger.reservedT, 20);
  assert.equal(initialLedger.availableT, 40);

  // 2. Partial delivery verification for bk-1: 35t accepted, 5t rejected
  const verifications = [
    {
      id: 'vr-1',
      bookingId: 'bk-1',
      loadRef: 'LOAD-001',
      materialId: 'mat-test-100',
      receiverId: 'rec-1',
      plannedT: 40,
      actualT: 40,
      acceptedT: 35,
      rejectedT: 5,
      status: 'verified',
    },
  ];

  const reconciledLedger = computeMaterialLedger(material, bookings, 0, verifications);
  assert.equal(reconciledLedger.totalT, 100);
  assert.equal(reconciledLedger.acceptedT, 35);
  assert.equal(reconciledLedger.rejectedT, 5);
  // Unverified committed is now 0 (bk-1 is verified), reserved is 20 (bk-2 is on hold)
  assert.equal(reconciledLedger.committedT, 0);
  assert.equal(reconciledLedger.reservedT, 20);
  // Crucial: The rejected 5t must NOT become available for resale!
  // Total allocated remains 40 (bk-1) + 20 (bk-2) = 60. Available must be exactly 40.
  assert.equal(reconciledLedger.availableT, 40, 'Rejected 5t must remain allocated in quarantine until reconciled, not resold');

  // 3. Test recordDelivery surplus preservation:
  const mockDataset = {
    materials: [
      {
        id: 'mat-test-100',
        projectId: 'proj-1',
        type: 'steel',
        quantityT: 100,
        status: 'published',
        listingStatus: 'published',
      },
    ],
    bookings: [
      {
        id: 'bk-1',
        materialId: 'mat-test-100',
        receiverId: 'rec-1',
        slotId: 'slot-1',
        tonnesT: 40,
        status: 'confirmed',
        loadRef: 'LOAD-001',
        receiverAcceptedAt: '2026-10-01T10:00:00Z',
      },
    ],
    verifications: [],
    events: [],
  };

  const deliveryResult = recordDelivery(mockDataset, {
    bookingId: 'bk-1',
    actualT: 40,
    acceptedT: 35,
    actor: { kind: 'receiver', name: 'Site QA' },
    at: '2026-10-02T10:00:00Z',
    evidence: [],
    rejectReason: '5 tonnes had flange distortion',
  });

  const updatedMat = deliveryResult.dataset.materials.find((m) => m.id === 'mat-test-100');
  assert.ok(updatedMat);
  // Crucial: Because 60 tonnes of surplus remains (100 - 40), status must NOT be prematurely marked "verified"!
  assert.equal(updatedMat.status, 'published', 'Parent material passport must stay active/published when surplus remains');
});

test('Phase 9.D: Direct ordering (Route A) via directOrderMaterialAction', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-p9-direct-order-'));
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
  const unauthed = client();
  const action = (c, name, ...args) => c('/actions', 'POST', { action: name, args });

  try {
    // 1. Setup accounts
    await provider('/auth/register', 'POST', { email: 'p9-provider@example.com', password: 'password123', organization: 'Direct Provider Corp' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'p9-receiver@example.com', password: 'password123', organization: 'Direct Buyer Infra' }, 201);
    await receiver('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Greater Noida Site 4' });

    // 2. Provider creates project and published steel listing (50t available at ₹36,000/t)
    const project = (await action(provider, 'addProjectAction', { name: 'P9 Demolition Site', location: 'Noida', status: 'active' })).result;
    const material = (await action(provider, 'addMaterialAction', {
      projectId: project.id,
      type: 'steel',
      quantityT: 50,
      quantityRangeT: [45, 55],
      condition: 'good',
      grade: 'A',
      confidence: 1,
      evidence: [],
      pricePerT: 36000,
      listingStatus: 'published',
    })).result;

    // 3. Security Check: Unauthenticated call is rejected
    await unauthed('/actions', 'POST', {
      action: 'directOrderMaterialAction',
      args: [{ materialId: material.id, quantityT: 15 }],
    }, 401);

    // 4. Role Guard: Provider cannot call directOrderMaterialAction (must be a receiver!)
    await provider('/actions', 'POST', {
      action: 'directOrderMaterialAction',
      args: [{ materialId: material.id, quantityT: 15 }],
    }, 403);

    // 5. Quantity Guard: Order exceeding available quantity is rejected (409)
    await receiver('/actions', 'POST', {
      action: 'directOrderMaterialAction',
      args: [{ materialId: material.id, quantityT: 60 }],
    }, 409);

    // 6. Valid Direct Order (Route A): Receiver orders 20t directly from catalog
    const today = new Date().toISOString().slice(0, 10);
    const orderRes = (await action(receiver, 'directOrderMaterialAction', {
      materialId: material.id,
      quantityT: 20,
      deliveryDate: today,
      destination: 'Greater Noida Site 4, Gate 2',
      idempotencyKey: 'idemp-p9-001',
    })).result;

    assert.ok(orderRes.id, 'Booking must be returned with ID');
    assert.equal(orderRes.materialId, material.id);
    assert.equal(orderRes.tonnesT, 20);
    assert.equal(orderRes.status, 'confirmed');
    assert.ok(orderRes.receiverAcceptedAt, 'Direct order must be auto-accepted by receiver');
    assert.equal(orderRes.agreedPricePerT, 36000);
    assert.equal(orderRes.directOrder, true);

    // 7. Idempotency test: Repeating submission with same key returns existing booking without duplicating
    const duplicateRes = (await action(receiver, 'directOrderMaterialAction', {
      materialId: material.id,
      quantityT: 20,
      deliveryDate: today,
      idempotencyKey: 'idemp-p9-001',
    })).result;

    assert.equal(duplicateRes.id, orderRes.id, 'Idempotent resubmission must return identical booking ID');

    // 8. Surplus verification: 50t total - 20t booked = 30t remaining. Ordering 35t now fails with 409.
    await receiver('/actions', 'POST', {
      action: 'directOrderMaterialAction',
      args: [{ materialId: material.id, quantityT: 35 }],
    }, 409);

    // Ordering 15t succeeds (leaves 15t surplus)
    const secondOrder = (await action(receiver, 'directOrderMaterialAction', {
      materialId: material.id,
      quantityT: 15,
      deliveryDate: today,
      destination: 'Greater Noida Site 4, Gate 3',
    })).result;
    assert.ok(secondOrder.id);
    assert.notEqual(secondOrder.id, orderRes.id);
    assert.equal(secondOrder.tonnesT, 15);

    // 9. Payment Authorization Check on Direct Order
    // Direct order can immediately proceed to simulated demo payment escrow
    const payment = (await action(receiver, 'createPaymentAttemptAction', {
      bookingId: orderRes.id,
      method: 'upi',
      simulateOutcome: 'captured',
    })).result;

    assert.ok(payment.attemptId, 'Payment attempt must be created');
    assert.equal(payment.amountMinor, 20 * 36000 * 100, 'Escrow deposit must equal 20t * 36,000 * 100 minor units');
  } finally {
    server.close();
    try { rmSync(directory, { recursive: true, force: true }); } catch {}
  }
});

test('Phase 9.E: Matching proximity penalty for missing location (no unearned 50% bonus)', () => {
  const dataset = {
    receivers: [
      {
        id: 'rec-pune',
        name: 'Pune Circular Intake',
        location: 'Pune Industrial Area',
        dailyIntakeT: 100,
        currentStockT: 10,
        acceptedTypes: ['steel'],
        distanceKm: 20,
        distanceKnown: true,
        geo: { lat: 18.52, lng: 73.85 },
      },
    ],
    materials: [
      {
        id: 'mat-located-20km',
        projectId: 'proj-1',
        type: 'steel',
        quantityT: 100,
        quantityRangeT: [90, 110],
        condition: 'good',
        grade: 'A',
        surveyedAt: '2026-09-01T10:00:00Z',
        status: 'active',
        confidence: 1,
        pricePerT: 35000,
        availableFrom: '2026-10-01',
        geo: { lat: 18.55, lng: 73.90 }, // ~6 km away
        evidence: [{ kind: 'lab-report', label: 'IS 2062 Lab Report', recordedAt: '2026-09-01T10:00:00Z' }],
      },
      {
        id: 'mat-unlocated',
        projectId: 'proj-2',
        type: 'steel',
        quantityT: 100,
        quantityRangeT: [90, 110],
        condition: 'good',
        grade: 'A',
        surveyedAt: '2026-09-01T10:00:00Z',
        status: 'active',
        confidence: 1,
        pricePerT: 35000,
        availableFrom: '2026-10-01',
        geo: undefined, // Missing location!
        evidence: [{ kind: 'lab-report', label: 'IS 2062 Lab Report', recordedAt: '2026-09-01T10:00:00Z' }],
      },
    ],
    bookings: [],
    demands: [],
    slots: [{ id: 'slot-pune', receiverId: 'rec-pune', materialType: 'steel', date: '2026-10-15', capacityT: 100 }],
    projects: [{ id: 'proj-1', name: 'P1', location: 'Pune', status: 'active', surveyedAt: '2026-09-01T10:00:00Z', lastActivityAt: '2026-09-01T10:00:00Z' }],
  };

  const receiver = dataset.receivers[0];

  const locatedMatch = evaluateMatch(dataset, {
    material: dataset.materials[0],
    receiver,
  });

  const unlocatedMatch = evaluateMatch(dataset, {
    material: dataset.materials[1],
    receiver,
  });

  // Located material has a high proximity score
  assert.ok(locatedMatch.factors.proximity.score > 0.8, 'Near material should have high proximity score');

  // Unlocated material MUST have 0.0 proximity score (not 0.5 default bonus!)
  assert.equal(unlocatedMatch.factors.proximity.score, 0.0, 'Missing location must receive 0 proximity score');
  assert.equal(unlocatedMatch.factors.proximity.impact, 'unknown');
  assert.ok(
    unlocatedMatch.drawbacks.some((d) => d.toLowerCase().includes('location') || d.toLowerCase().includes('distance')),
    'Must note missing location in drawbacks'
  );

  // Located match score must strictly exceed unlocated match score
  assert.ok(
    locatedMatch.score > unlocatedMatch.score,
    `Located match (${locatedMatch.score}) must rank higher than unlocated match (${unlocatedMatch.score})`
  );
});
