import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './databaseHarness.mjs';

const samplePdf = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCg==';
const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('Phase 4: Verification & Trust — complete evidence, missing checks, evidence reuse, authorization guards, dispatch requirements, intake reconciliation, and corrective recovery', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-p4-trust-'));
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

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  try {
    // 0. Setup Accounts
    await provider('/auth/register', 'POST', { email: 'provider-trust@example.com', password: 'password123', organization: 'Metro Reclaimers Ltd' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'receiver-trust@example.com', password: 'password123', organization: 'Apex Eco Processing' }, 201);
    const receiverId = (await receiver('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Whitefield Processing Facility, Bengaluru' })).user.receiverId;

    await outsider('/auth/register', 'POST', { email: 'outsider-trust@example.com', password: 'password123', organization: 'Outsider Corp' }, 201);
    await outsider('/profile', 'PATCH', { workspaces: ['provider', 'receiver'], activeWorkspace: 'provider' });

    // 1. Case 1 & Case 2: Missing or invalid required evidence prevents certification
    const proj = (await action(provider, 'addProjectAction', { name: 'Metro Terminal Demolition', location: 'Whitefield, Bengaluru', status: 'active' })).result;
    const material = (await action(provider, 'addMaterialAction', {
      projectId: proj.id,
      type: 'crushed-concrete',
      quantityT: 100,
      quantityRangeT: [90, 110],
      confidence: 0.95,
      condition: 'good',
      grade: 'A',
      location: 'Whitefield, Bengaluru',
      costPerTonne: 50,
    })).result;

    assert.equal(material.verificationStatus, 'unverified');

    // Case 2: Attempting to certify unverified passport without mandatory evidence fails with 400
    await actionExpect(receiver, 400, 'reviewPassportAction', {
      materialId: material.id,
      status: 'verified',
      notes: 'Attempting premature certification without evidence.',
    });

    // Case 4: Unauthorized party guards
    // Provider cannot self-verify own passport
    await actionExpect(provider, 403, 'reviewPassportAction', {
      materialId: material.id,
      status: 'verified',
      notes: 'I self-certify my material.',
    });

    // Outsider upload cannot be stolen
    const providerDoc = await provider('/uploads', 'POST', { name: 'core-test.pdf', data: samplePdf }, 201);
    const outsiderDoc = await outsider('/uploads', 'POST', { name: 'outsider.pdf', data: samplePdf }, 201);
    const outsiderProj = (await action(outsider, 'addProjectAction', { name: 'Outsider Project', location: 'Bengaluru', status: 'active' })).result;
    const outsiderMat = (await action(outsider, 'addMaterialAction', {
      projectId: outsiderProj.id,
      type: 'concrete',
      quantityT: 20,
      quantityRangeT: [18, 22],
      confidence: 0.9,
      grade: 'B',
      condition: 'good',
    })).result;
    await actionExpect(outsider, 400, 'addMaterialEvidenceAction', outsiderMat.id, {
      kind: 'lab-report',
      label: 'Stolen test report',
      ref: providerDoc.ref,
    });

    // Provider attaches genuine core test lab report
    const matWith1 = (await action(provider, 'addMaterialEvidenceAction', material.id, {
      kind: 'lab-report',
      label: 'IS 516 Core Test Compressive Strength (35 MPa)',
      ref: providerDoc.ref,
      verified: false,
    })).result;

    assert.equal(matWith1.evidence.length, 1);
    assert.equal(matWith1.verificationStatus, 'evidence-submitted');

    // Case 3: Existing valid evidence should not be requested or duplicated again
    const matReAttached = (await action(provider, 'addMaterialEvidenceAction', material.id, {
      kind: 'lab-report',
      label: 'IS 516 Core Test Compressive Strength (35 MPa)',
      ref: providerDoc.ref,
      verified: false,
    })).result;

    // Must not add a duplicate item for the same upload ref!
    assert.equal(matReAttached.evidence.length, 1, 'Duplicate evidence submission must be prevented/reused');

    // Provider attaches remaining required evidence (site photo & survey sheet)
    const photoDoc = await provider('/uploads', 'POST', { name: 'stockpile.png', data: samplePng }, 201);
    const surveyDoc = await provider('/uploads', 'POST', { name: 'salvage-survey.pdf', data: samplePdf }, 201);

    await action(provider, 'addMaterialEvidenceAction', material.id, {
      kind: 'site-photo',
      label: 'Stockpile Covered Bay Photo',
      ref: photoDoc.ref,
    });

    const completeMat = (await action(provider, 'addMaterialEvidenceAction', material.id, {
      kind: 'survey-sheet',
      label: 'Pre-demolition Salvage Log',
      ref: surveyDoc.ref,
    })).result;

    assert.equal(completeMat.evidence.length, 3, 'All 3 category documents attached');

    // Provider submits for review
    await action(provider, 'submitPassportForReviewAction', material.id, 'All category evidence uploaded per IS 516.');

    // Case 1: Complete verification evidence certified by authorized reviewer
    const verifiedMat = (await action(receiver, 'reviewPassportAction', {
      materialId: material.id,
      status: 'verified',
      notes: 'All compliance evidence verified. High quality reclaimed structural aggregate.',
      evidenceReviews: [
        { refOrId: completeMat.evidence[0].id, status: 'valid', notes: 'Core test verified authentic.' },
        { refOrId: completeMat.evidence[1].id, status: 'valid', notes: 'Stockpile condition verified clean.' },
        { refOrId: completeMat.evidence[2].id, status: 'valid', notes: 'Survey notes complete.' },
      ],
    })).result;

    assert.equal(verifiedMat.verificationStatus, 'verified');
    assert.ok(verifiedMat.verifiedAt, 'verifiedAt timestamp recorded');
    assert.ok(verifiedMat.verifiedBy, 'verifiedBy recorded');
    assert.ok(verifiedMat.verificationAudit.length >= 2, 'Audit trail recorded');

    // 2. Case 5 & Case 7: Failed check, dispatch prevention, and corrective recovery
    // Create second material that gets rejected during review
    const mat2 = (await action(provider, 'addMaterialAction', {
      projectId: proj.id,
      type: 'concrete',
      quantityT: 50,
      quantityRangeT: [45, 55],
      confidence: 0.9,
      condition: 'fair',
      grade: 'B',
      location: 'Whitefield, Bengaluru',
      costPerTonne: 40,
    })).result;

    const mat2Doc = await provider('/uploads', 'POST', { name: 'preliminary.png', data: samplePng }, 201);
    await action(provider, 'addMaterialEvidenceAction', mat2.id, {
      kind: 'site-photo',
      label: 'Preliminary inspection photo',
      ref: mat2Doc.ref,
    });
    await action(provider, 'submitPassportForReviewAction', mat2.id);

    // Receiver rejects with mandatory reason
    const rejectedMat = (await action(receiver, 'reviewPassportAction', {
      materialId: mat2.id,
      status: 'rejected',
      rejectionReason: 'Missing aggregate gradation analysis per IS 383 and presence of surface asphalt.',
      notes: 'Cannot approve without clean sieve gradation test.',
    })).result;

    assert.equal(rejectedMat.verificationStatus, 'rejected');
    assert.equal(rejectedMat.rejectionReason, 'Missing aggregate gradation analysis per IS 383 and presence of surface asphalt.');

    // Book capacity for mat2
    const slot = (await action(receiver, 'addCapacityAction', { receiverId, date: tomorrow, materialType: 'concrete', capacityT: 50 })).result;
    const bookingRes = await action(provider, 'requestCapacityAction', { materialId: mat2.id, receiverId, slotId: slot.id, tonnesT: 30 });
    const booking = bookingRes.dataset.bookings[0];
    await action(receiver, 'acceptRequestAction', booking.id);
    await action(provider, 'updateDeliveryAction', booking.id, 'ready');
    await action(provider, 'updateDeliveryAction', booking.id, 'picked-up');

    // Case 5: Dispatch is blocked because passport verification is rejected!
    await actionExpect(provider, 409, 'dispatchAction', { bookingId: booking.id });

    // Case 7: Corrective Action Recovery path
    // Provider uploads the missing IS 383 gradation report to correct the deficiency
    const correctiveDoc = await provider('/uploads', 'POST', { name: 'is383-gradation-curve.pdf', data: samplePdf }, 201);
    const correctedMat = (await action(provider, 'addMaterialEvidenceAction', mat2.id, {
      kind: 'lab-report',
      label: 'IS 383:2016 Gradation Curve Assay & Organic Impurities Test',
      ref: correctiveDoc.ref,
    })).result;

    // Status transitions from 'rejected' to 'evidence-submitted' automatically upon uploading corrective evidence!
    assert.equal(correctedMat.verificationStatus, 'evidence-submitted', 'Status must recover to evidence-submitted after corrective upload');

    // Also attach site condition photo confirming asphalt segregation
    const segregationDoc = await provider('/uploads', 'POST', { name: 'segregated-bay.png', data: samplePng }, 201);
    await action(provider, 'addMaterialEvidenceAction', mat2.id, {
      kind: 'site-photo',
      label: 'Segregated Stockpile Photo — Zero Asphalt Contamination',
      ref: segregationDoc.ref,
    });
    const surveySheetDoc = await provider('/uploads', 'POST', { name: 'salvage-log.pdf', data: samplePdf }, 201);
    await action(provider, 'addMaterialEvidenceAction', mat2.id, {
      kind: 'survey-sheet',
      label: 'Segregated Salvage Methodology Sheet',
      ref: surveySheetDoc.ref,
    });

    // Provider re-submits for review
    await action(provider, 'submitPassportForReviewAction', mat2.id, 'Gradation report and segregated bay evidence provided.');

    // Receiver verifies the corrected passport
    const reVerifiedMat = (await action(receiver, 'reviewPassportAction', {
      materialId: mat2.id,
      status: 'verified',
      notes: 'Deficiencies resolved. Zone II grading confirmed compliant with IS 383.',
    })).result;

    assert.equal(reVerifiedMat.verificationStatus, 'verified');

    // Now dispatch succeeds!
    await action(provider, 'dispatchAction', { bookingId: booking.id });
    await action(provider, 'updateDeliveryAction', booking.id, 'arrived');

    // 3. Case 6: Receiving inspection & weighbridge reconciliation
    const ticketDoc = await receiver('/uploads', 'POST', { name: 'wb-gate-ticket.png', data: samplePng }, 201);
    const ticketEvidence = [{ kind: 'weighbridge-ticket', label: 'Gate Weighbridge Ticket #WB-901', ref: ticketDoc.ref }];

    // Record load receipt with weighbridge ticket
    const receiveRes = await action(receiver, 'receiveLoadAction', booking.id, 29.5, ticketEvidence);
    const vr = receiveRes.dataset.verifications.find((v) => v.bookingId === booking.id);
    assert.ok(vr, 'Verification record created');
    assert.equal(vr.status, 'pending');
    assert.equal(vr.actualT, 29.5);

    // Invalid reconciliation: accepted + rejected != actualT fails with 400
    await actionExpect(receiver, 400, 'verifyLoadAction', vr.id, 28.0, 0.5, 'Discrepancy');

    // Rejection without reason fails with 400
    await actionExpect(receiver, 400, 'verifyLoadAction', vr.id, 28.0, 1.5, '');

    // Valid reconciliation: accepted 28.0t, rejected 1.5t with reason
    const verifiedIntakeRes = await action(receiver, 'verifyLoadAction', vr.id, 28.0, 1.5, '1.5 tonnes contained excessive moisture fines');
    const finalVr = verifiedIntakeRes.dataset.verifications.find((v) => v.id === vr.id);

    assert.equal(finalVr.status, 'verified');
    assert.equal(finalVr.acceptedT, 28.0);
    assert.equal(finalVr.rejectedT, 1.5);
    assert.equal(finalVr.rejectReason, '1.5 tonnes contained excessive moisture fines');
    assert.ok(finalVr.verifiedAt);

    // Completed verification audit event recorded
    const event = verifiedIntakeRes.dataset.events.find((e) => e.kind === 'verification.completed' && e.subjectIds.includes(vr.id));
    assert.ok(event, 'verification.completed event recorded');

  } finally {
    await new Promise((res) => server.close(res));
    rmSync(directory, { recursive: true, force: true });
  }
});
