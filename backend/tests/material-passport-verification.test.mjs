import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './databaseHarness.mjs';

const samplePdf = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCg==';
const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('Material Passport & Verification: Complete passports, genuine evidence, reviewer permissions, compliance-aware eligibility, and auditable history', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-passport-verification-'));
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

  try {
    // 1. Setup Accounts
    await provider('/auth/register', 'POST', { email: 'passport-provider@example.com', password: 'password123', organization: 'Metro Reclaimers Ltd' }, 201);
    await provider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    await receiver('/auth/register', 'POST', { email: 'passport-receiver@example.com', password: 'password123', organization: 'Apex Eco Processing' }, 201);
    await receiver('/profile', 'PATCH', { workspaces: ['receiver'], activeWorkspace: 'receiver', location: 'Whitefield Processing Facility, Bengaluru' });

    await outsider('/auth/register', 'POST', { email: 'outsider-user@example.com', password: 'password123', organization: 'Outsider Corp' }, 201);
    await outsider('/profile', 'PATCH', { workspaces: ['provider'], activeWorkspace: 'provider' });

    // 2. Provider creates Project & Material Passport
    const proj = (await action(provider, 'addProjectAction', { name: 'Metro Terminal 1 Demolition', location: 'Whitefield, Bengaluru', status: 'active' })).result;
    const initialMat = (await action(provider, 'addMaterialAction', {
      projectId: proj.id,
      type: 'crushed-concrete',
      quantityT: 120,
      quantityRangeT: [110, 130],
      confidence: 0.95,
      condition: 'good',
      grade: 'A',
      location: 'Whitefield, Bengaluru',
      availableFrom: '2026-11-01',
      availableTo: '2026-12-31',
      costPerTonne: 45,
    })).result;

    assert.ok(initialMat.id, 'Material created');
    assert.equal(initialMat.verificationStatus, 'unverified', 'Initial verification status must be unverified');
    assert.deepEqual(initialMat.evidence, [], 'Initial evidence should be empty');

    // 3. Complete Material Passport: Update identity & provenance
    const updatedDetails = (await action(provider, 'updateMaterialPassportDetailsAction', initialMat.id, {
      name: 'Structural Crushed Concrete 40mm',
      dimensions: '40mm graded coarse aggregate',
      provenance: {
        structureOfOrigin: 'Metro Terminal 1 Runway & Deck Framing',
        yearBuilt: 1998,
        deconstructionMethod: 'selective-demolition',
        previousUse: 'Heavy load-bearing aircraft transit apron',
        handlingInstructions: 'Store in covered aggregate bay, avoid mud contamination',
      },
      surveyNotes: 'Inspected on-site during controlled hydraulic demolition.',
    })).result;

    assert.equal(updatedDetails.name, 'Structural Crushed Concrete 40mm');
    assert.equal(updatedDetails.dimensions, '40mm graded coarse aggregate');
    assert.equal(updatedDetails.provenance?.yearBuilt, 1998);
    assert.equal(updatedDetails.provenance?.structureOfOrigin, 'Metro Terminal 1 Runway & Deck Framing');

    // Outsider cannot update provider's passport details
    await actionExpect(outsider, 403, 'updateMaterialPassportDetailsAction', initialMat.id, { name: 'Malicious Rename' });

    // 4. Evidence Management: Non-fabricated genuine uploads & ownership verification
    // Attempting to attach non-existent or fabricated upload reference must be rejected
    await actionExpect(provider, 400, 'addMaterialEvidenceAction', initialMat.id, {
      kind: 'test-report',
      label: 'Fabricated Test Report',
      ref: '/api/uploads/00000000-0000-0000-0000-fabricated00',
    });

    // Provider uploads genuine document
    const uploadRes = await provider('/uploads', 'POST', {
      name: 'is516-compressive-strength-test.pdf',
      data: samplePdf,
    }, 201);
    assert.ok(uploadRes.ref, 'Upload created');

    // Outsider cannot attach provider's uploaded file to their own passport
    const outsiderProj = (await action(outsider, 'addProjectAction', { name: 'Outsider Project', location: 'Bengaluru', status: 'active' })).result;
    const outsiderMat = (await action(outsider, 'addMaterialAction', {
      projectId: outsiderProj.id,
      type: 'crushed-concrete',
      quantityT: 50,
      quantityRangeT: [45, 55],
      confidence: 0.9,
      grade: 'B',
      condition: 'fair',
    })).result;
    await actionExpect(outsider, 400, 'addMaterialEvidenceAction', outsiderMat.id, {
      kind: 'test-report',
      label: 'Stolen Evidence',
      ref: uploadRes.ref,
    });

    // Provider attaches genuine evidence to their passport
    const matWithEvidence = (await action(provider, 'addMaterialEvidenceAction', initialMat.id, {
      kind: 'test-report',
      label: 'IS 516:1959 Core Compressive Strength Test (32.5 MPa)',
      ref: uploadRes.ref,
      verified: false,
      metadata: {
        documentType: 'test-report',
        standard: 'IS 516:1959',
        testLab: 'Civil Engineering Testing Services Ltd',
        result: 'Pass - 32.5 MPa compressive strength',
      },
    })).result;

    assert.equal(matWithEvidence.evidence.length, 1);
    assert.equal(matWithEvidence.verificationStatus, 'evidence-submitted', 'Status automatically moves to evidence-submitted when genuine evidence is added');
    assert.equal(matWithEvidence.evidence[0].metadata?.standard, 'IS 516:1959');

    // 5. Submit for Review
    const submittedMat = (await action(provider, 'submitPassportForReviewAction', initialMat.id)).result;
    assert.equal(submittedMat.verificationStatus, 'under-review', 'Status changes to under-review');

    // Outsider cannot submit provider's material
    await actionExpect(outsider, 403, 'submitPassportForReviewAction', initialMat.id);

    // 6. Reviewer Authorization & Anti-Self-Verification
    // Provider cannot self-verify their own passport
    await actionExpect(provider, 403, 'reviewPassportAction', {
      materialId: initialMat.id,
      status: 'verified',
      notes: 'I self-certify my own materials as top quality.',
    });

    // Outsider (not reviewer) cannot review passport
    await actionExpect(outsider, 403, 'reviewPassportAction', {
      materialId: initialMat.id,
      status: 'verified',
      notes: 'Review by random outsider',
    });

    // 7. Compliance-Aware Review: Rejection with mandatory reason
    // Attempting to reject without rejectionReason fails with 400
    await actionExpect(receiver, 400, 'reviewPassportAction', {
      materialId: initialMat.id,
      status: 'rejected',
      notes: 'No reason provided',
    });

    // Receiver rejects with valid reason
    const rejectedMat = (await action(receiver, 'reviewPassportAction', {
      materialId: initialMat.id,
      status: 'rejected',
      rejectionReason: 'Missing aggregate gradation sieve analysis report per IS 383.',
      notes: 'Strength test is acceptable, but gradation curve documentation is required before use in structural mixes.',
      evidenceChecks: [
        { evidenceId: matWithEvidence.evidence[0].id, status: 'valid', notes: 'Core test verified authentic.' },
      ],
    })).result;

    assert.equal(rejectedMat.verificationStatus, 'rejected');
    assert.equal(rejectedMat.rejectionReason, 'Missing aggregate gradation sieve analysis report per IS 383.');
    assert.ok(rejectedMat.verificationAudit.length >= 1, 'Audit log recorded');
    const lastAudit = rejectedMat.verificationAudit[rejectedMat.verificationAudit.length - 1];
    assert.equal(lastAudit.action, 'rejected');
    assert.equal(lastAudit.rejectionReason, 'Missing aggregate gradation sieve analysis report per IS 383.');

    // 8. Provider resolves deficiency by uploading second evidence item
    const sieveUpload = await provider('/uploads', 'POST', {
      name: 'is383-gradation-analysis.png',
      data: samplePng,
    }, 201);

    const reSuppliedMat = (await action(provider, 'addMaterialEvidenceAction', initialMat.id, {
      kind: 'lab-report',
      label: 'IS 383 Sieve Gradation Analysis & Fineness Modulus',
      ref: sieveUpload.ref,
      verified: false,
      metadata: {
        documentType: 'lab-report',
        standard: 'IS 383:2016',
        testLab: 'Civil Engineering Testing Services Ltd',
        result: 'Zone II compliant graded 40mm-20mm',
      },
    })).result;

    assert.equal(reSuppliedMat.evidence.length, 2);
    assert.equal(reSuppliedMat.verificationStatus, 'evidence-submitted');

    // Provider re-submits for review
    await action(provider, 'submitPassportForReviewAction', initialMat.id);

    // 9. Compliance Guard: Receiver verification is blocked while mandatory evidence (site photo) is missing
    await actionExpect(receiver, 400, 'reviewPassportAction', {
      materialId: initialMat.id,
      status: 'verified',
      notes: 'Attempting to verify prematurely without photographic condition record.',
    });

    // Provider uploads required site condition photograph
    const photoUpload = await provider('/uploads', 'POST', {
      name: 'site-aggregate-condition.png',
      data: samplePng,
    }, 201);

    const completeMat = (await action(provider, 'addMaterialEvidenceAction', initialMat.id, {
      kind: 'site-photo',
      label: 'Site Photo: Graded aggregate stockpile under covered storage',
      ref: photoUpload.ref,
      verified: false,
      metadata: {
        documentType: 'site-photo',
        testLab: 'Metro Site Inspection Team',
        result: 'Clean, segregated aggregate bay',
      },
    })).result;

    assert.equal(completeMat.evidence.length, 3);

    // Provider re-submits for review
    await action(provider, 'submitPassportForReviewAction', initialMat.id);

    // Now receiver completes verification successfully
    const verifiedMat = (await action(receiver, 'reviewPassportAction', {
      materialId: initialMat.id,
      status: 'verified',
      notes: 'All compliance evidence verified per IS 516 and IS 383 standards. High quality reclaimed structural aggregate.',
      evidenceChecks: [
        { evidenceId: completeMat.evidence[0].id, status: 'valid', notes: 'Core test verified.' },
        { evidenceId: completeMat.evidence[1].id, status: 'valid', notes: 'Gradation curve confirmed Zone II.' },
        { evidenceId: completeMat.evidence[2].id, status: 'valid', notes: 'Site storage verified covered.' },
      ],
    })).result;

    assert.equal(verifiedMat.verificationStatus, 'verified');
    assert.ok(verifiedMat.verifiedAt, 'verifiedAt timestamp recorded');
    assert.ok(verifiedMat.verifiedBy, 'verifiedBy user recorded');
    assert.equal(verifiedMat.verificationNotes, 'All compliance evidence verified per IS 516 and IS 383 standards. High quality reclaimed structural aggregate.');
    assert.ok(verifiedMat.verificationAudit.length >= 3, 'Complete auditable verification history preserved');

    // 10. Verify Data API reflects verified passport and evidence status
    const pDataset = (await provider('/dataset')).dataset;
    const storedMat = pDataset.materials.find((m) => m.id === initialMat.id);
    assert.ok(storedMat, 'Material exists in provider dataset');
    assert.equal(storedMat.verificationStatus, 'verified');
    assert.equal(storedMat.name, 'Structural Crushed Concrete 40mm');
    assert.equal(storedMat.dimensions, '40mm graded coarse aggregate');
    assert.equal(storedMat.provenance?.structureOfOrigin, 'Metro Terminal 1 Runway & Deck Framing');
    assert.equal(storedMat.evidence.length, 3);
    assert.equal(storedMat.evidence[0].status, 'valid');

    // Receiver should see the verified material in provider listings
    const rDataset = (await receiver('/dataset')).dataset;
    const listing = rDataset.providerListings.find((l) => l.materialId === initialMat.id);
    assert.ok(listing, 'Material listing visible to receiver');
    assert.equal(listing.verificationStatus, 'verified');
    assert.equal(listing.name, 'Structural Crushed Concrete 40mm');

    // 11. Evidence Removal Check: Owner can remove unneeded evidence
    const removedMat = (await action(provider, 'removeMaterialEvidenceAction', initialMat.id, storedMat.evidence[1].id)).result;
    assert.equal(removedMat.evidence.length, 2);

    // Outsider cannot delete provider's evidence
    await actionExpect(outsider, 403, 'removeMaterialEvidenceAction', initialMat.id, storedMat.evidence[0].id);

  } finally {
    await new Promise((res) => server.close(res));
    rmSync(directory, { recursive: true, force: true });
  }
});
