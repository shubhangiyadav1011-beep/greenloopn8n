import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './databaseHarness.mjs';
import {
  parseProcurementPrompt,
  queryContextualProcurement,
  prepareOrderConfirmation,
} from '../../shared/domain/procurementAssistant.ts';

test('Contextual Procurement Assistant: Natural language extraction, real inventory matching, landed cost intelligence, and safe requisition', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-procurement-assistant-'));
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

  try {
    // 1. Setup Accounts
    await provider('/auth/register', 'POST', { email: 'assistant-provider@example.com', password: 'password123', organization: 'Metro Reclaimers' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'assistant-receiver@example.com', password: 'password123', organization: 'Apex Eco Processing' }, 201);
    const receiverProfile = (await receiver('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Whitefield, Bengaluru' })).user;

    // 2. Provider creates Project & Concrete Material
    const proj = (await action(provider, 'addProjectAction', { name: 'Metro Civic Center Demolition', location: 'Whitefield, Bengaluru', status: 'active' })).result;
    const mat = (await action(provider, 'addMaterialAction', {
      projectId: proj.id,
      type: 'crushed-concrete',
      quantityT: 100,
      quantityRangeT: [90, 110],
      confidence: 0.95,
      condition: 'good',
      grade: 'A',
      location: 'Whitefield, Bengaluru',
      pricePerT: 850,
      availableFrom: '2026-11-01',
    })).result;

    // Provider sets name & dimensions
    await action(provider, 'updateMaterialPassportDetailsAction', mat.id, {
      name: 'Structural Crushed Concrete 40mm',
      dimensions: '40mm graded coarse aggregate',
      provenance: {
        structureOfOrigin: 'Metro Terminal Pier Framing',
        yearBuilt: 1999,
        deconstructionMethod: 'selective-demolition',
      },
    });

    // 3. Test NLP Parsing & Intent Recognition
    const prompt1 = 'Need 50 tonnes of Grade A crushed concrete for Whitefield project next week with verified test report under ₹1200/t';
    const parsed1 = parseProcurementPrompt(prompt1);

    assert.equal(parsed1.intent, 'search_materials');
    assert.equal(parsed1.extracted.materialType, 'crushed-concrete');
    assert.equal(parsed1.extracted.quantityT, 50);
    assert.equal(parsed1.extracted.grade, 'A');
    assert.equal(parsed1.extracted.location, 'Whitefield');
    assert.equal(parsed1.extracted.requireVerifiedPassport, true);
    assert.equal(parsed1.extracted.budgetPerT, 1200);

    // Test comparison intent
    const prompt2 = 'Compare landed cost for concrete vs virgin benchmark';
    const parsed2 = parseProcurementPrompt(prompt2);
    assert.equal(parsed2.intent, 'compare_costs');
    assert.equal(parsed2.extracted.materialType, 'crushed-concrete');

    // Test order status intent
    const prompt3 = 'Check delivery tracking for order BK-1001';
    const parsed3 = parseProcurementPrompt(prompt3);
    assert.equal(parsed3.intent, 'check_orders');
    assert.equal(parsed3.extracted.orderId, 'BK-1001');

    // Test request material intent
    const prompt4 = `Request 35t of ${mat.id} for delivery next week`;
    const parsed4 = parseProcurementPrompt(prompt4);
    assert.equal(parsed4.intent, 'request_material');
    assert.equal(parsed4.extracted.specificMaterialId, mat.id);
    assert.equal(parsed4.extracted.quantityT, 35);

    // 4. Test Deterministic Contextual Matching against Live Dataset
    const dataset = (await receiver('/dataset')).dataset;
    const generalReq = {
      materialType: 'crushed-concrete',
      quantityT: 50,
      location: 'Whitefield',
      budgetPerT: 1200,
    };
    const recommendations = queryContextualProcurement(dataset, generalReq, 'Whitefield, Bengaluru');

    assert.ok(recommendations.length >= 1, 'Should find at least 1 matching asset');
    const topMatch = recommendations[0];
    const topMatId = 'id' in topMatch.material ? topMatch.material.id : topMatch.material.materialId;
    assert.equal(topMatId, mat.id, 'Top match should be the created material');
    assert.equal(topMatch.candidate.isEligible, true, 'Material should be eligible for general procurement');
    assert.ok(topMatch.candidate.score > 0.5, 'Match score should reflect strong category fit');
    assert.ok(topMatch.landedCost.reusableLandedCostPerT, 'Landed cost per tonne should be calculated');

    // 5. Compliance-Aware Procurement: When requireVerifiedPassport is true, unverified asset is gated
    const verifiedReq = { ...generalReq, requireVerifiedPassport: true };
    const verifiedRecommendations = queryContextualProcurement(dataset, verifiedReq, 'Whitefield, Bengaluru');
    const unverifiedCandidate = verifiedRecommendations.find((r) => ('id' in r.material ? r.material.id : r.material.materialId) === mat.id);
    assert.ok(unverifiedCandidate, 'Asset found in search');
    assert.equal(unverifiedCandidate.candidate.isEligible, false, 'Unverified asset must be gated when verification is required');
    assert.equal(unverifiedCandidate.candidate.score, 0, 'Ineligible asset score must strictly be 0');

    // 6. Test Landed Cost & Virgin Savings Calculation
    assert.ok(topMatch.savingsVsVirgin, 'Savings vs virgin benchmark should be computed');
    assert.ok(topMatch.savingsVsVirgin.virginLandedPerT > topMatch.landedCost.reusableLandedCostPerT, 'Reclaimed material should be cheaper than virgin benchmark');
    assert.ok(topMatch.savingsVsVirgin.percent > 0, 'Savings percent should be positive');

    // 7. Test Explicit Order Confirmation Preparation (Consequential Action Safety)
    const confirmation = prepareOrderConfirmation(
      topMatch,
      50,
      'Whitefield, Bengaluru',
      '2026-11-10'
    );

    assert.equal(confirmation.materialId, mat.id);
    assert.equal(confirmation.quantityT, 50);
    assert.equal(confirmation.unitPricePerT, 850);
    assert.ok(confirmation.estimatedFreightPerT > 0);
    assert.ok(confirmation.estimatedHandlingPerT > 0);
    assert.equal(confirmation.totalLandedCostPerT, 850 + confirmation.estimatedFreightPerT + confirmation.estimatedHandlingPerT);
    assert.equal(confirmation.totalEstimatedAmount, confirmation.totalLandedCostPerT * 50);
    assert.equal(confirmation.isEligible, true);

    // 7. Test Action Execution: Receiver submits confirmed formal requisition
    const demandResult = (await action(receiver, 'addDemandAction', {
      receiverId: receiverProfile.receiverId,
      materialType: confirmation.materialType,
      requiredT: confirmation.quantityT,
      period: confirmation.requestedDate,
      location: confirmation.destination,
      targetMaterialId: confirmation.materialId,
      notes: 'Procured via GreenLoop Conversational Assistant',
    })).result;

    assert.ok(demandResult.id, 'Demand requisition created');
    assert.equal(demandResult.targetMaterialId, mat.id);
    assert.equal(demandResult.requiredT, 50);

    // Verify dataset now contains the requisition
    const updatedDataset = (await receiver('/dataset')).dataset;
    const storedDemand = updatedDataset.demands.find((d) => d.id === demandResult.id);
    assert.ok(storedDemand, 'Demand must exist in database');
    assert.equal(storedDemand.targetMaterialId, mat.id);

  } finally {
    await new Promise((res) => server.close(res));
    rmSync(directory, { recursive: true, force: true });
  }
});
