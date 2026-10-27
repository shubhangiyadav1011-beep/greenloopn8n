import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './databaseHarness.mjs';
import {
  calculateLandedCost,
  VIRGIN_MATERIAL_BENCHMARKS,
  DEFAULT_HANDLING_RATES,
  calculateTransportCostPerT,
  getVirginBenchmark,
} from '../../shared/domain/landedCost.ts';

test('Phase 6: Landed-cost calculation engine and defensible virgin benchmarks', async () => {
  // 1. Verify all 6 core materials have defensible benchmarks
  const coreMaterials = ['steel', 'concrete', 'brick', 'timber', 'glass', 'plasterboard'];
  for (const mat of coreMaterials) {
    const bm = VIRGIN_MATERIAL_BENCHMARKS[mat];
    assert.ok(bm, `Virgin benchmark must exist for ${mat}`);
    assert.ok(bm.landedCostPerT > 0, `Benchmark landed rate must be positive for ${mat}`);
    assert.ok(bm.pricePerT > 0, `Benchmark base price must be positive for ${mat}`);
    assert.ok(bm.source && bm.source.length > 5, `Benchmark must have authoritative source citation for ${mat}`);
  }

  // 2. Complete calculation for reclaimed structural steel
  const steelCalc = calculateLandedCost({
    materialType: 'steel',
    quantityT: 20,
    pricePerT: 32000,
    distanceKm: 25,
    distanceKnown: true,
    transportCostPerT: 500,
    handlingCostPerT: 150,
    testingCostPerT: 100,
    destination: 'Okhla Industrial Area, Delhi',
  });

  assert.equal(steelCalc.status, 'complete');
  assert.equal(steelCalc.materialType, 'steel');
  assert.equal(steelCalc.quantityT, 20);

  // Reusable landed cost: 32,000 + 500 + 150 + 100 = 32,750 / t
  assert.equal(steelCalc.reusableLandedCostPerT, 32750);
  assert.equal(steelCalc.reusableTotalCost, 32750 * 20);

  // Virgin benchmark for steel: 65,000 / t (62,000 base + 3,000 logistics)
  assert.ok(steelCalc.benchmark);
  assert.equal(steelCalc.benchmark.landedCostPerT, 65000);
  assert.equal(steelCalc.virginTotalCost, 65000 * 20);

  // Savings: 65,000 - 32,750 = 32,250 / t -> 645,000 total
  assert.equal(steelCalc.savingsPerT, 32250);
  assert.equal(steelCalc.totalSavings, 645000);
  assert.equal(steelCalc.savingsPercentage, 50);

  // Itemized costs check
  assert.ok(steelCalc.items.length >= 3);
  const baseItem = steelCalc.items.find((i) => i.key === 'material');
  assert.ok(baseItem && baseItem.ratePerT === 32000 && !baseItem.isEstimated && !baseItem.missing);
  const haulageItem = steelCalc.items.find((i) => i.key === 'transport');
  assert.ok(haulageItem && haulageItem.ratePerT === 500 && !haulageItem.isEstimated);

  // 3. Edge Case: Missing material price (Pricing pending)
  // Must NOT invent prices or fabricate savings
  const pendingCalc = calculateLandedCost({
    materialType: 'concrete',
    quantityT: 50,
    pricePerT: null,
    distanceKm: 15,
  });

  assert.equal(pendingCalc.status, 'pricing_pending');
  assert.equal(pendingCalc.reusableLandedCostPerT, null);
  assert.equal(pendingCalc.reusableTotalCost, null);
  assert.equal(pendingCalc.totalSavings, null);
  assert.equal(pendingCalc.savingsPercentage, null);
  assert.ok(pendingCalc.missingItems.some((item) => item.toLowerCase().includes('base price') || item.toLowerCase().includes('price')));
  assert.ok(pendingCalc.statusMessage.toLowerCase().includes('quoted by provider'));

  // 4. Edge Case: Custom material specification without benchmark
  // Must NOT fabricate benchmarks
  const customCalc = calculateLandedCost({
    materialType: 'aerospace_carbon_composite',
    quantityT: 5,
    pricePerT: 150000,
    distanceKm: 10,
  });

  assert.equal(customCalc.status, 'benchmark_unavailable');
  assert.equal(customCalc.benchmark, null);
  assert.equal(customCalc.virginTotalCost, null);
  assert.equal(customCalc.totalSavings, null);
  assert.equal(customCalc.savingsPercentage, null);

  // 5. Edge Case: Unconfirmed transit distance
  // Must flag distance as estimated and label transport item as estimated
  const unconfirmedDistCalc = calculateLandedCost({
    materialType: 'brick',
    quantityT: 30,
    pricePerT: 3200,
    distanceKm: undefined,
    distanceKnown: false,
  });

  assert.equal(unconfirmedDistCalc.isDistanceEstimated, true);
  const unconfirmedTransport = unconfirmedDistCalc.items.find((i) => i.key === 'transport');
  assert.ok(unconfirmedTransport);
  assert.equal(unconfirmedTransport.isEstimated, true);

  // 6. Edge Case: Cost premium (Reclaimed asset more expensive than virgin benchmark)
  // Must NOT invent savings or disguise premium
  const premiumCalc = calculateLandedCost({
    materialType: 'concrete',
    quantityT: 10,
    pricePerT: 5200, // Virgin benchmark is 4,650
    distanceKm: 20,
    transportCostPerT: 400,
    handlingCostPerT: 150,
  });

  assert.equal(premiumCalc.status, 'cost_premium');
  assert.ok(premiumCalc.totalSavings < 0, 'Net savings must be negative');
  assert.ok(premiumCalc.savingsPercentage < 0, 'Savings percentage must be negative');

  // 7. Edge Case: Fractional quantity (0.25 tonnes)
  const fracCalc = calculateLandedCost({
    materialType: 'timber',
    quantityT: 0.25,
    pricePerT: 20000,
    distanceKm: 10,
  });
  assert.equal(fracCalc.status, 'complete');
  assert.equal(fracCalc.quantityT, 0.25);
  assert.ok(fracCalc.reusableTotalCost > 0);
  assert.ok(fracCalc.virginTotalCost > 0);
  assert.ok(fracCalc.totalSavings > 0);
});

test('Phase 6: Landed-cost API endpoints and database resolution', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-phase6-test-'));
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
    // 1. Authentication check
    await unauthed('/landed-cost', 'POST', { materialType: 'steel', quantityT: 10 }, 401);

    // 2. Register users
    await provider('/auth/register', 'POST', { email: 'p6-provider@example.com', password: 'password123', organization: 'Cost Engineers Provider' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'p6-receiver@example.com', password: 'password123', organization: 'Cost Engineers Receiver' }, 201);
    const receiverId = (await receiver('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Noida Sector 62' })).user.receiverId;

    // 3. Direct calculation via POST /api/landed-cost
    const directRes = await receiver('/landed-cost', 'POST', {
      materialType: 'steel',
      quantityT: 15,
      pricePerT: 34000,
      distanceKm: 30,
      transportCostPerT: 600,
      handlingCostPerT: 120,
    });

    assert.ok(directRes.calculation);
    assert.equal(directRes.calculation.status, 'complete');
    assert.equal(directRes.calculation.materialType, 'steel');
    assert.equal(directRes.calculation.quantityT, 15);
    assert.equal(directRes.calculation.reusableLandedCostPerT, 34720);
    assert.equal(directRes.calculation.benchmark.landedCostPerT, 65000);
    assert.ok(directRes.calculation.totalSavings > 0);
    assert.ok(directRes.calculation.savingsPercentage > 40);

    // 4. Create Material (as provider) and resolve against receiver in database
    const project = (await action(provider, 'addProjectAction', { name: 'P6 Test Demolition', location: 'Gurugram', status: 'active' })).result;
    const material = (await action(provider, 'addMaterialAction', {
      projectId: project.id,
      type: 'brick',
      quantityT: 40,
      quantityRangeT: [40, 40],
      condition: 'good',
      grade: 'A',
      confidence: 1,
      evidence: [],
      pricePerT: 2800,
    })).result;

    // Call /landed-cost with materialId and receiverId
    const resolvedRes = await receiver('/landed-cost', 'POST', {
      materialId: material.id,
      receiverId,
      quantityT: 25,
    });

    assert.ok(resolvedRes.calculation);
    assert.equal(resolvedRes.calculation.status, 'complete');
    assert.equal(resolvedRes.calculation.materialType, 'brick');
    assert.equal(resolvedRes.calculation.quantityT, 25);
    assert.ok(resolvedRes.calculation.destination);
    assert.ok(resolvedRes.calculation.benchmark.name.toLowerCase().includes('brick'));
    assert.ok(resolvedRes.calculation.totalSavings > 0);

    // 5. Validation failures
    await receiver('/landed-cost', 'POST', { quantityT: -5, materialType: 'steel' }, 400);
    await receiver('/landed-cost', 'POST', { quantityT: 10 }, 400); // missing materialType
  } finally {
    server.close();
    try { rmSync(directory, { recursive: true, force: true }); } catch {}
  }
});
