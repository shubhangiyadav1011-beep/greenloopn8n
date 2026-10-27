import { createActions } from '../actions.ts';
import { ApiError, choice, date, geo, number, requireThat, text } from '../validation.mjs';
import { availableT, requestCapacity, slotMatchesDemandPeriod } from '../../../shared/domain/capacity.ts';
import { acceptedOffersAwaitingBooking } from '../../../shared/domain/orders.ts';
import { evaluatePassportCompliance } from '../../../shared/domain/compliance.ts';

const materialType = value => {
  requireThat(typeof value === 'string', 'Invalid material type.');
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  requireThat(normalized.length >= 2 && normalized.length <= 40, 'Invalid material type.');
  return normalized;
};

export function createActionService({ datasetModel, datasetService, userModel, uploadModel, negotiationModel, paymentService, supportModel, auctionService }) {
  const own = (id, user) => {
    text(id, 'record ID', 250);
    requireThat(datasetModel.ownerId(id) === user.id, 'You do not have permission to change this record.', 403);
  };
  const assign = (id, user) => datasetModel.assignOwner(id, user.id);
  const evidence = (items, user) => {
    requireThat(Array.isArray(items) && items.length <= 20, 'Invalid evidence list.');
    return items.map(item => {
      requireThat(item && typeof item === 'object' && !Array.isArray(item), 'Invalid evidence item.');
      const result = {
        kind: choice(item.kind, ['survey-sheet', 'site-photo', 'lab-report', 'weighbridge-ticket', 'certificate', 'test-report', 'chain-of-custody'], 'evidence type'),
        label: text(item.label, 'evidence label', 250),
        recordedAt: item.recordedAt ? new Date(item.recordedAt).toISOString() : new Date().toISOString(),
      };
      if (item.id) result.id = text(item.id, 'evidence ID', 250);
      if (item.status) result.status = choice(item.status, ['valid', 'pending', 'rejected'], 'evidence status');
      if (item.notes) result.notes = text(item.notes, 'evidence notes', 1000, true);
      if (item.rejectionReason) result.rejectionReason = text(item.rejectionReason, 'rejection reason', 1000, true);
      if (item.metadata && typeof item.metadata === 'object') result.metadata = item.metadata;
      if (item.ref) {
        text(item.ref, 'evidence reference', 250);
        const id = /^\/api\/uploads\/([\w-]+)$/.exec(item.ref)?.[1];
        requireThat(id && uploadModel.ownerId(id) === user.id, 'Upload evidence before attaching it.');
        result.ref = item.ref;
      }
      return result;
    });
  };

  return {
    execute(user, action, args) {
      if (['sendNegotiationMessageAction','proposeFinalTermsAction','approveFinalTermsAction'].includes(action)) auctionService?.ensureOfferActive(args[0]);
      return datasetModel.transaction(() => {
        requireThat(typeof action === 'string' && args.length > 0, 'Invalid operation.');
        const objectActions = ['addProjectAction', 'addMaterialAction', 'addDemandAction', 'saveDemandDraftAction', 'addCapacityAction', 'requestCapacityAction', 'directOrderMaterialAction', 'cancelBookingAction', 'dispatchAction', 'addOfferAction', 'saveOfferDraftAction', 'verifyAction', 'addSupportRequestAction', 'createPaymentAttemptAction', 'disputePaymentAction', 'reviewPassportAction'];
        if (objectActions.includes(action)) requireThat(args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]), 'Invalid operation input.');
        const dataset = datasetModel.load();
        if (action === 'markNotificationsReadAction') {
          const ids = args[0];
          requireThat(Array.isArray(ids) && ids.length <= 1000, 'Invalid notifications.');
          const available = new Set(datasetService.visible(dataset, user).events.map(event => event.id));
          for (const id of ids) { text(id, 'notification ID', 250); requireThat(available.has(id), 'Notification not found.', 404); }
          const readEventIds = new Set(user.readEventIds ?? []);
          for (const id of ids) readEventIds.add(id);
          user.readEventIds = [...readEventIds];
          userModel.updateProfile(user);
          return { dataset: { ...datasetService.visible(dataset, user), readEventIds: user.readEventIds }, result: user.readEventIds };
        }
        const demandTarget = (input, existingDemandId) => {
          if (!input.targetMaterialId) return {};
          const id = text(input.targetMaterialId, 'target material ID', 100);
          const material = dataset.materials.find(item => item.id === id && !item.archivedAt);
          const account = userModel.publicContact(datasetModel.ownerId(id) ?? '');
          requireThat(material && account, 'This provider material is no longer available.', 409);
          const committed = dataset.bookings.filter(item => item.materialId === id && item.status !== 'cancelled' && (!existingDemandId || item.demandId !== existingDemandId)).reduce((sum, item) => sum + item.tonnesT, 0);
          requireThat(number(input.requiredT, 'required quantity') <= material.quantityT - committed - (auctionService?.reservedT(id) ?? 0), 'Request exceeds this listing’s available material.', 409);
          requireThat(material.type === input.materialType, 'The request must use the selected material type.', 409);
          requireThat(!material.availableFrom || input.period >= material.availableFrom, 'The selected material is not available by that date.', 409);
          const provider = account.profile;
          return { targetMaterialId: id, targetProviderId: account.email, targetProviderName: provider.organization || provider.name || 'Provider' };
        };
        const role = expected => requireThat(user.workspaces.includes(expected) && user.activeWorkspace === expected, `Switch to your ${expected} workspace to continue.`, 403);
        const booking = id => { const item = dataset.bookings.find(b => b.id === id); requireThat(item, 'Booking not found.', 404); return item; };
        const receiverBooking = id => { role('receiver'); const item = booking(id); own(item.receiverId, user); return item; };
        const providerBooking = id => { role('provider'); const item = booking(id); own(item.materialId, user); return item; };
        const offer = id => { role('receiver'); const item = dataset.offers.find(o => o.id === id); requireThat(item, 'Offer not found.', 404); own(dataset.demands.find(d => d.id === item.demandId)?.receiverId, user); requireThat(item.status === 'pending', 'This offer has already been decided.', 409); return item; };
        const receiverActions = ['updateDemandAction', 'deleteDemandAction', 'addDemandAction', 'saveDemandDraftAction', 'deleteDemandDraftAction', 'addCapacityAction', 'updateCapacityAction', 'acceptOfferAction', 'scheduleAcceptedOfferAction', 'declineOfferAction', 'acceptRequestAction', 'rejectRequestAction', 'receiveLoadAction', 'verifyLoadAction', 'verifyAction', 'reviewPassportAction'];
        if (action === 'counterOfferAction' && user.activeWorkspace === 'receiver') receiverActions.push(action);
        if (action === 'cancelDemandAction' || (action === 'archiveBookingAction' && user.activeWorkspace === 'receiver')) receiverActions.push(action);
        const engine = createActions(dataset, { kind: receiverActions.includes(action) ? 'receiver' : 'contractor', name: user.name || user.email });
        let result;
        let nextOverride;
        const appendEvent = (state, event) => {
          const highest = state.events.reduce((max, item) => Math.max(max, Number(/^EV-(\d+)$/.exec(item.id)?.[1] ?? 0)), 0);
          return { ...event, id: `EV-${String(highest + 1).padStart(3, '0')}` };
        };
        const negotiationContext = offerId => {
          const item = dataset.offers.find(candidate => candidate.id === text(offerId, 'offer ID', 250));
          requireThat(item, 'Offer not found.', 404);
          requireThat(!item.archivedAt, 'This offer is archived.', 409);
          auctionService?.assertOfferDeadline(item.id);
          const demand = dataset.demands.find(candidate => candidate.id === item.demandId);
          const material = dataset.materials.find(candidate => candidate.id === item.passportId);
          requireThat(demand && material && !demand.archivedAt && !material.archivedAt && demand.status !== 'CANCELLED', 'The offer is no longer available.', 409);
          const providerUserId = datasetModel.ownerId(item.passportId);
          const receiverUserId = datasetModel.ownerId(demand.receiverId);
          requireThat(providerUserId && receiverUserId && providerUserId !== receiverUserId, 'This offer does not have two eligible participants.', 409);
          const participantRole = providerUserId === user.id ? 'provider' : receiverUserId === user.id ? 'receiver' : null;
          requireThat(participantRole, 'You are not a participant in this negotiation.', 403);
          role(participantRole);
          negotiationModel.ensure(item.id, providerUserId, receiverUserId, item.createdAt);
          return { offer: item, demand, material, participantRole };
        };
        switch (action) {
          case 'updateMaterialAction': {
            role('provider'); own(args[0], user);
            requireThat(!auctionService?.hasActive(args[0]), 'Material terms are locked while an auction is active.', 409);
            const record = dataset.materials.find(item => item.id === args[0] && !item.archivedAt);
            requireThat(record, 'Passport not found.', 404);
            requireThat(!dataset.bookings.some(item => item.materialId === record.id), 'Passports linked to orders cannot be edited. Create a new passport for additional material.', 409);
            const p = args[1]; requireThat(p && typeof p === 'object' && !Array.isArray(p), 'Invalid passport input.');
            result = engine.updateMaterialAction(record.id, {
              type: materialType(p.type),
              quantityT: number(p.quantityT, 'quantity'),
              condition: choice(p.condition, ['good', 'fair', 'poor'], 'condition'),
              grade: choice(p.grade, ['A', 'B', 'C'], 'grade'),
              surveyNotes: text(p.surveyNotes ?? '', 'notes', 5000, true),
              pricePerT: p.pricePerT == null ? null : number(p.pricePerT, 'price', true),
              availableFrom: p.availableFrom == null ? null : date(p.availableFrom),
              ...(p.reusable !== undefined ? { reusable: Boolean(p.reusable) } : {}),
              ...(p.geo ? { geo: geo(p.geo) } : {}),
            });
            requireThat(result, 'Material type, grade and condition cannot change while offers are pending.', 409); break;
          }
          case 'deleteMaterialAction': {
            role('provider'); own(args[0], user);
            requireThat(!auctionService?.hasActive(args[0]), 'Material cannot be removed while an auction is active.', 409);
            requireThat(dataset.materials.some(item => item.id === args[0] && !item.archivedAt), 'Passport not found.', 404);
            result = engine.deleteMaterialAction(args[0]); requireThat(result, 'Passports linked to orders or delivery proof cannot be deleted.', 409); break;
          }
          case 'setMaterialListingStatusAction': {
            role('provider'); own(args[0], user);
            const materialId = text(args[0], 'material ID', 250);
            const status = choice(args[1], ['draft', 'published', 'paused', 'archived'], 'listing status');
            const record = dataset.materials.find(item => item.id === materialId && !item.archivedAt);
            requireThat(record, 'Passport not found.', 404);
            if (status === 'archived' || status === 'paused') {
              requireThat(!auctionService?.hasActive(materialId), 'Cannot change listing status while an auction is active.', 409);
            }
            result = engine.setMaterialListingStatusAction(materialId, status);
            requireThat(result, 'Failed to update listing status.', 400);
            break;
          }
          case 'addMaterialEvidenceAction': {
            role('provider');
            const materialId = text(args[0], 'material ID', 250);
            own(materialId, user);
            const material = dataset.materials.find(m => m.id === materialId && !m.archivedAt);
            requireThat(material, 'Passport not found.', 404);
            requireThat(args[1] && typeof args[1] === 'object' && !Array.isArray(args[1]), 'Invalid evidence object.');
            const evItem = evidence([args[1]], user)[0];
            const isAlreadyAttached = (material.evidence ?? []).some(e => e.ref && evItem.ref && e.ref === evItem.ref);
            if (isAlreadyAttached) {
              result = material;
              nextOverride = { ...dataset };
              break;
            }
            if (!evItem.id) evItem.id = `EVD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            evItem.status = 'pending';
            result = engine.addMaterialEvidenceAction(materialId, evItem);
            requireThat(result, 'Passport not found.', 404);
            break;
          }
          case 'removeMaterialEvidenceAction': {
            role('provider');
            const materialId = text(args[0], 'material ID', 250);
            own(materialId, user);
            const refOrId = text(args[1], 'evidence reference or ID', 250);
            result = engine.removeMaterialEvidenceAction(materialId, refOrId);
            requireThat(result, 'Evidence not found on this passport.', 404);
            break;
          }
          case 'submitPassportForReviewAction': {
            role('provider');
            const materialId = text(args[0], 'material ID', 250);
            own(materialId, user);
            const material = dataset.materials.find(m => m.id === materialId && !m.archivedAt);
            requireThat(material, 'Passport not found.', 404);
            requireThat(material.evidence?.length, 'Upload at least one evidence document before submitting for review.', 400);
            const notes = args[1] ? text(args[1], 'submission notes', 2000, true) : undefined;
            result = engine.submitPassportForReviewAction(materialId, notes);
            requireThat(result, 'Passport not found.', 404);
            break;
          }
          case 'reviewPassportAction': {
            const input = args[0];
            const materialId = text(input.materialId, 'material ID', 250);
            const material = dataset.materials.find(m => m.id === materialId && !m.archivedAt);
            requireThat(material, 'Passport not found.', 404);
            requireThat(datasetModel.ownerId(materialId) !== user.id, 'Providers cannot verify their own material passports.', 403);
            requireThat(user.workspaces.includes('receiver') || user.workspaces.includes('admin'), 'Only authorized reviewers or receivers can verify passports.', 403);
            role('receiver');
            const status = choice(input.status, ['verified', 'rejected'], 'verification status');
            const notes = input.notes ? text(input.notes, 'review notes', 2000, true) : undefined;
            const rejectionReason = input.rejectionReason ? text(input.rejectionReason, 'rejection reason', 2000, true) : undefined;
            if (status === 'rejected') {
              requireThat(rejectionReason && rejectionReason.trim().length > 0, 'A rejection reason is required when rejecting a passport.', 400);
            }
            if (status === 'verified') {
              const compliance = evaluatePassportCompliance(material);
              requireThat(compliance.isCompliant, `Cannot verify passport: missing mandatory evidence (${compliance.missingMandatory.join(', ')}).`, 400);
            }
            let evidenceReviews;
            if (Array.isArray(input.evidenceReviews)) {
              evidenceReviews = input.evidenceReviews.map(r => ({
                refOrId: text(r.refOrId, 'evidence identifier', 250),
                status: choice(r.status, ['valid', 'rejected'], 'evidence item status'),
                notes: r.notes ? text(r.notes, 'evidence notes', 1000, true) : undefined,
                rejectionReason: r.rejectionReason ? text(r.rejectionReason, 'rejection reason', 1000, true) : undefined,
              }));
            }
            result = engine.reviewPassportAction({
              materialId,
              status,
              notes,
              rejectionReason,
              reviewerName: user.name || user.email,
              evidenceReviews,
            });
            requireThat(result, 'Failed to update passport verification.', 400);
            break;
          }
          case 'updateMaterialPassportDetailsAction': {
            role('provider');
            const materialId = text(args[0], 'material ID', 250);
            own(materialId, user);
            const p = args[1];
            requireThat(p && typeof p === 'object' && !Array.isArray(p), 'Invalid details input.');
            const name = p.name ? text(p.name, 'material name', 250, true) : undefined;
            const dimensions = p.dimensions ? text(p.dimensions, 'dimensions', 250, true) : undefined;
            const provenance = p.provenance && typeof p.provenance === 'object' ? p.provenance : undefined;
            const surveyNotes = p.surveyNotes !== undefined ? text(p.surveyNotes, 'survey notes', 5000, true) : undefined;
            result = engine.updateMaterialPassportDetailsAction(materialId, { name, dimensions, provenance, surveyNotes });
            requireThat(result, 'Passport not found.', 404);
            break;
          }
          case 'updateDemandAction': {
            role('receiver'); const record = dataset.demands.find(item => item.id === args[0] && !item.archivedAt); requireThat(record, 'Request not found.', 404); own(record.receiverId, user);
            const p = args[1]; requireThat(p && typeof p === 'object' && !Array.isArray(p), 'Invalid request input.');
            const period = date(p.period); requireThat(period >= new Date().toISOString().slice(0, 10), 'Choose a future needed-by date.');
            if (record.targetMaterialId) demandTarget({ ...p, period, targetMaterialId: record.targetMaterialId }, record.id);
            result = engine.updateDemandAction(record.id, { materialType: materialType(p.materialType), requiredT: number(p.requiredT, 'required quantity'), period, location: text(p.location, 'location', 250), notes: text(p.notes ?? '', 'notes', 5000, true), budgetPerT: p.budgetPerT == null ? null : number(p.budgetPerT, 'budget', true) });
            requireThat(result, 'Keep the existing material and delivery location for linked orders. Quantity and deadline must cover existing commitments; cancelled requests cannot be edited.', 409); break;
          }
          case 'deleteDemandAction': {
            role('receiver'); const record = dataset.demands.find(item => item.id === args[0] && !item.archivedAt); requireThat(record, 'Request not found.', 404); own(record.receiverId, user);
            result = engine.deleteDemandAction(record.id); requireThat(result, 'Requests linked to orders cannot be deleted.', 409); break;
          }
          case 'addProjectAction': {
            role('provider'); const p = args[0]; result = engine.addProjectAction({ name: text(p.name, 'project name', 250), location: text(p.location, 'location', 250), status: choice(p.status, ['active', 'demolition', 'complete'], 'project status'), geo: geo(p.geo) }); assign(result.id, user); break;
          }
          case 'addMaterialAction': {
            role('provider'); const m = args[0]; own(m.projectId, user); number(m.quantityT, 'quantity'); requireThat(Array.isArray(m.quantityRangeT) && m.quantityRangeT.length === 2, 'Invalid quantity range.');
            number(m.quantityRangeT[0], 'minimum quantity', true); number(m.quantityRangeT[1], 'maximum quantity'); requireThat(m.quantityRangeT[0] <= m.quantityT && m.quantityRangeT[1] >= m.quantityT, 'Quantity must fit its estimate range.');
            number(m.confidence, 'confidence', true); requireThat(m.confidence <= 1, 'Confidence must be between zero and one.');
            const listingStatus = m.listingStatus ? choice(m.listingStatus, ['draft', 'published', 'paused', 'archived'], 'listing status') : 'published';
            result = engine.addMaterialAction({
              projectId: m.projectId,
              type: materialType(m.type),
              quantityT: m.quantityT,
              originalUnit: m.originalUnit,
              originalQuantity: m.originalQuantity,
              conversionFactor: m.conversionFactor,
              quantityRangeT: m.quantityRangeT,
              condition: choice(m.condition, ['good', 'fair', 'poor'], 'condition'),
              grade: choice(m.grade, ['A', 'B', 'C'], 'grade'),
              confidence: m.confidence,
              surveyNotes: text(m.surveyNotes ?? '', 'notes', 5000, true),
              evidence: evidence(m.evidence ?? [], user),
              pricePerT: m.pricePerT === undefined ? undefined : number(m.pricePerT, 'price', true),
              availableFrom: m.availableFrom === undefined ? undefined : date(m.availableFrom),
              geo: geo(m.geo),
              ...(m.name ? { name: text(m.name, 'material name', 250, true) } : {}),
              ...(m.dimensions ? { dimensions: text(m.dimensions, 'dimensions', 250, true) } : {}),
              ...(m.provenance && typeof m.provenance === 'object' ? { provenance: m.provenance } : {}),
              ...(m.reusable !== undefined ? { reusable: Boolean(m.reusable) } : {}),
              listingStatus,
            });
            assign(result.id, user);
            break;
          }
          case 'bulkImportMaterialsAction': {
            role('provider');
            const items = args[0];
            requireThat(Array.isArray(items) && items.length > 0, 'Provide at least one material to import.', 400);
            requireThat(items.length <= 50, 'Maximum 50 items can be imported at once.', 400);
            const validated = [];
            for (let i = 0; i < items.length; i++) {
              const m = items[i];
              requireThat(m && typeof m === 'object', `Row ${i + 1}: Invalid row object.`);
              own(m.projectId, user);
              const q = number(m.quantityT, `Row ${i + 1} quantity`);
              requireThat(q > 0, `Row ${i + 1}: Quantity must be greater than 0.`);
              const cond = choice(m.condition, ['good', 'fair', 'poor'], `Row ${i + 1} condition`);
              const grd = choice(m.grade, ['A', 'B', 'C'], `Row ${i + 1} grade`);
              const t = materialType(m.type);
              const range = Array.isArray(m.quantityRangeT) && m.quantityRangeT.length === 2
                ? [number(m.quantityRangeT[0], `Row ${i + 1} min qty`, true), number(m.quantityRangeT[1], `Row ${i + 1} max qty`)]
                : [Math.round(q * 0.9 * 10) / 10, Math.round(q * 1.1 * 10) / 10];
              const conf = m.confidence !== undefined ? number(m.confidence, `Row ${i + 1} confidence`, true) : 0.85;
              const status = m.listingStatus ? choice(m.listingStatus, ['draft', 'published', 'paused', 'archived'], `Row ${i + 1} listing status`) : 'published';
              validated.push({
                projectId: m.projectId,
                type: t,
                quantityT: q,
                quantityRangeT: range,
                condition: cond,
                grade: grd,
                confidence: conf,
                surveyNotes: text(m.surveyNotes ?? '', `Row ${i + 1} notes`, 5000, true),
                evidence: evidence(m.evidence ?? [], user),
                pricePerT: m.pricePerT != null && m.pricePerT !== '' ? number(m.pricePerT, `Row ${i + 1} price`, true) : undefined,
                availableFrom: m.availableFrom ? date(m.availableFrom) : undefined,
                reusable: m.reusable !== undefined ? Boolean(m.reusable) : true,
                listingStatus: status,
              });
            }
            result = engine.bulkImportMaterialsAction(validated);
            for (const mat of result) {
              assign(mat.id, user);
            }
            break;
          }
          case 'addDemandAction':
          case 'saveDemandDraftAction': {
            role('receiver'); const d = args[0]; own(user.receiverId, user); date(d.period); requireThat(d.period >= new Date().toISOString().slice(0, 10), 'The needed-by date is in the past.');
            const target = demandTarget(d);
            const input = { receiverId: user.receiverId, materialType: materialType(d.materialType), requiredT: number(d.requiredT, 'required quantity'), period: d.period, location: text(d.location, 'location', 250), notes: text(d.notes ?? '', 'notes', 5000, true), budgetPerT: d.budgetPerT === undefined ? undefined : number(d.budgetPerT, 'budget per tonne', true), geo: geo(d.geo), ...target };
            result = action === 'addDemandAction' ? engine.addDemandAction(input) : engine.saveDemandDraftAction(input); assign(result.id, user); break;
          }
          case 'deleteDemandDraftAction': {
            role('receiver'); const demandId = text(args[0], 'request ID', 250); const demand = dataset.demands.find(item => item.id === demandId);
            requireThat(demand && demand.status === 'DRAFT', 'Only a saved draft request can be deleted.', 409); own(demand.receiverId, user);
            result = engine.deleteDemandDraftAction(demandId); requireThat(result, 'This draft request no longer exists.', 409); datasetModel.deleteOwner(demandId); break;
          }
          case 'addCapacityAction': {
            role('receiver'); const s = args[0]; own(s.receiverId, user); date(s.date); requireThat(s.date >= new Date().toISOString().slice(0, 10), 'This receiving slot is in the past.'); const slotType = materialType(s.materialType);
            requireThat(!dataset.slots.some(x => x.receiverId === s.receiverId && x.date === s.date && x.materialType === slotType), 'A slot already exists for this material and date.', 409);
            result = engine.addCapacityAction({ receiverId: s.receiverId, date: s.date, materialType: slotType, capacityT: number(s.capacityT, 'capacity') }); break;
          }
          case 'updateCapacityAction': {
            role('receiver'); const slot = dataset.slots.find(s => s.id === args[0]); requireThat(slot, 'Slot not found.', 404); own(slot.receiverId, user); number(args[1], 'capacity'); result = engine.updateCapacityAction(...args); requireThat(result, 'Capacity cannot be reduced below reserved tonnes.', 409); break;
          }
          case 'requestCapacityAction': {
            role('provider'); const input = args[0]; own(input.materialId, user); number(input.tonnesT, 'requested quantity');
            requireThat(input.tonnesT > 0, 'Requested quantity must be greater than zero.', 400);
            const material = dataset.materials.find(m => m.id === input.materialId);
            requireThat(material && !material.archivedAt, 'Material passport not found or archived.', 404);
            requireThat(material.listingStatus !== 'draft' && material.listingStatus !== 'paused' && material.listingStatus !== 'archived', 'Cannot allocate an asset that is in draft, paused, or archived. Publish or relist the asset first.', 409);
            let slot = dataset.slots.find(s => s.id === input.slotId);
            if (!slot && typeof input.slotId === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.slotId.trim())) {
              const targetDate = input.slotId.trim();
              requireThat(targetDate >= new Date().toISOString().slice(0, 10), 'This proposed delivery date is in the past.', 400);
              requireThat(!material.availableFrom || targetDate >= material.availableFrom, 'The material is not available by this proposed delivery date.', 409);
              slot = dataset.slots.find(s => s.receiverId === input.receiverId && s.materialType === material.type && s.date === targetDate);
              if (!slot) {
                const receiver = dataset.receivers.find(r => r.id === input.receiverId);
                requireThat(receiver, 'Receiver not found.', 404);
                if (receiver.acceptedTypes?.length && !receiver.acceptedTypes.includes(material.type) && !dataset.demands.some(d => d.receiverId === input.receiverId && d.materialType === material.type)) {
                  throw new ApiError(409, 'Receiver does not accept this material type.');
                }
                const cap = receiver.dailyIntakeT && receiver.dailyIntakeT > 0 ? receiver.dailyIntakeT : 50;
                slot = engine.addCapacityAction({ receiverId: input.receiverId, date: targetDate, materialType: material.type, capacityT: cap });
              }
            }
            requireThat(slot && slot.receiverId === input.receiverId && slot.materialType === material.type, 'Choose a compatible receiver slot or proposed delivery date.', 409);
            const committed = dataset.bookings.filter(item => item.materialId === material.id && item.status !== 'cancelled').reduce((sum, item) => sum + item.tonnesT, 0);
            const auctionReserved = auctionService?.reservedT(material.id) ?? 0;
            const availableSurplus = Math.max(0, Math.round((material.quantityT - committed - auctionReserved) * 10) / 10);
            requireThat(input.tonnesT <= availableSurplus + 1e-9, auctionReserved > 0 ? 'Requested quantity includes material reserved for an auction.' : `Requested quantity (${input.tonnesT} t) exceeds available surplus (${availableSurplus.toFixed(1)} t). Maximum allocatable surplus is ${availableSurplus.toFixed(1)} t.`, 409);
            requireThat(slot.date >= new Date().toISOString().slice(0, 10), 'This receiving slot is in the past.', 400);
            result = engine.requestCapacityAction({ materialId: input.materialId, receiverId: input.receiverId, slotId: slot.id, tonnesT: input.tonnesT }); break;
          }
          case 'directOrderMaterialAction': {
            role('receiver');
            const input = args[0];
            requireThat(input && typeof input === 'object', 'Invalid direct order input.', 400);
            const materialId = text(input.materialId, 'material ID', 100);
            const quantityT = number(input.quantityT, 'order quantity');
            requireThat(quantityT > 0, 'Order quantity must be greater than zero.', 400);

            const material = dataset.materials.find(m => m.id === materialId);
            requireThat(material && !material.archivedAt, 'Material passport not found or archived.', 404);
            requireThat(material.listingStatus === 'published' || (!material.listingStatus && material.status !== 'cancelled' && material.status !== 'verified'), 'Cannot directly order an unlisted or draft asset. Listing must be published.', 409);
            requireThat(material.pricePerT != null && material.pricePerT > 0, 'Direct ordering requires published pricing on the asset listing.', 409);

            // Compliance check: Structural grade A requires verification status not rejected
            requireThat(material.verificationStatus !== 'rejected', 'Cannot order a material with rejected compliance verification.', 409);

            const destination = text(input.destination || user.location || 'Site Intake', 'destination', 250);
            const targetDate = typeof input.deliveryDate === 'string' && input.deliveryDate.trim()
              ? input.deliveryDate.trim()
              : new Date().toISOString().slice(0, 10);
            date(targetDate);
            requireThat(targetDate >= new Date().toISOString().slice(0, 10), 'The delivery date must be today or in the future.', 400);
            requireThat(!material.availableFrom || targetDate >= material.availableFrom, 'The material is not available by this delivery date.', 409);

            // Idempotency: prevent double-click duplicate orders within 60 seconds
            if (input.idempotencyKey) {
              const key = text(input.idempotencyKey, 'idempotency key', 100);
              const recentDuplicate = dataset.bookings.find(b =>
                b.receiverId === user.receiverId &&
                b.materialId === material.id &&
                b.directOrderKey === key &&
                b.status !== 'cancelled'
              );
              if (recentDuplicate) {
                result = recentDuplicate;
                nextOverride = { ...dataset };
                break;
              }
            }

            // Atomic capacity & inventory check
            const committedMaterialT = dataset.bookings
              .filter(b => b.materialId === material.id && b.status !== 'cancelled')
              .reduce((sum, b) => sum + b.tonnesT, 0) + (auctionService?.reservedT(material.id) ?? 0);
            const availableMaterialT = material.quantityT - committedMaterialT;
            requireThat(quantityT <= availableMaterialT + 1e-9, `Requested quantity (${quantityT} t) exceeds available stock (${Math.max(0, availableMaterialT).toFixed(1)} t).`, 409);

            // Resolve or create receiver intake capacity slot
            let currentDataset = engine.getDataset();
            let slot = currentDataset.slots.find(s => s.receiverId === user.receiverId && s.materialType === material.type && s.date === targetDate);
            if (!slot) {
              const receiver = currentDataset.receivers.find(r => r.id === user.receiverId);
              requireThat(receiver, 'Receiver profile not found.', 404);
              if (receiver.acceptedTypes?.length && !receiver.acceptedTypes.includes(material.type)) {
                throw new ApiError(409, 'Receiver facility does not accept this material type.');
              }
              const cap = receiver.dailyIntakeT && receiver.dailyIntakeT > 0 ? receiver.dailyIntakeT : 50;
              slot = engine.addCapacityAction({ receiverId: user.receiverId, date: targetDate, materialType: material.type, capacityT: Math.max(cap, quantityT) });
              currentDataset = engine.getDataset();
            }

            // Confirm slot intake capacity
            const slotBookings = currentDataset.bookings.filter(b => b.slotId === slot.id && b.status !== 'cancelled');
            const slotReserved = slotBookings.filter(b => b.status === 'confirmed').reduce((sum, b) => sum + b.tonnesT, 0) + (slot.reservedT ?? 0);
            const slotAvailable = slot.capacityT - slotReserved;
            requireThat(quantityT <= slotAvailable + 1e-9, 'Receiving slot intake capacity is insufficient for this quantity.', 409);

            const at = new Date().toISOString();
            // Request capacity reservation
            const reservation = requestCapacity(currentDataset, {
              materialId: material.id,
              receiverId: user.receiverId,
              slotId: slot.id,
              tonnesT: quantityT,
              actor: { kind: 'receiver', name: user.name || user.email },
              at,
            });
            requireThat(reservation.output.outcome === 'confirmed', 'Capacity could not be confirmed for this direct order.', 409);

            const newBooking = reservation.output.booking;
            const booking = {
              ...newBooking,
              receiverAcceptedAt: at,
              agreedPricePerT: material.pricePerT,
              destination,
              directOrder: true,
              directOrderKey: input.idempotencyKey || undefined,
            };

            const directOrderEvent = appendEvent(reservation.dataset, {
              at,
              kind: 'order.direct_placed',
              actor: { kind: 'receiver', name: user.name || user.email },
              summary: `Direct Order ${booking.id} placed for ${quantityT.toFixed(1)} t ${material.type} at ₹${material.pricePerT}/t`,
              detail: `Direct checkout Route A: confirmed with receiver acceptance. Destination: ${destination}`,
              subjectIds: [material.id, user.receiverId, slot.id, booking.id],
            });

            result = booking;
            nextOverride = {
              ...reservation.dataset,
              bookings: reservation.dataset.bookings.map(b => b.id === newBooking.id ? booking : b),
              events: [...reservation.dataset.events, directOrderEvent],
            };
            break;
          }
          case 'cancelBookingAction': {
            const b = providerBooking(args[0].bookingId); requireThat(!b.loadRef && !b.receiverAcceptedAt && b.status !== 'cancelled', 'Accepted, dispatched, or cancelled bookings cannot be cancelled.', 409);
            result = engine.cancelBookingAction({ bookingId: b.id, reason: text(args[0].reason ?? '', 'reason', 1000, true) }); break;
          }
          case 'updateDeliveryAction': {
            const b = providerBooking(args[0]); const stage = choice(args[1], ['ready', 'picked-up', 'arrived'], 'delivery stage'); result = engine.updateDeliveryAction(b.id, stage); break;
          }
          case 'dispatchAction': {
            const b = providerBooking(args[0].bookingId); requireThat(b.status === 'confirmed' && b.receiverAcceptedAt && !b.loadRef, 'The receiver must accept this booking before dispatch.', 409);
            const stages = dataset.events.filter(event => event.subjectIds.includes(b.id));
            requireThat(!stages.some(event => event.kind === 'delivery.ready') || stages.some(event => event.kind === 'delivery.picked-up'), 'Record pickup before dispatching this load.', 409);
            const mat = dataset.materials.find(m => m.id === b.materialId);
            if (mat) {
              requireThat(mat.verificationStatus !== 'rejected', 'Cannot dispatch load: material passport verification was rejected. Corrective documentation must be submitted and approved before dispatch.', 409);
            }
            let dispatchDocs = [];
            if (Array.isArray(args[0].documents) && args[0].documents.length > 0) {
              dispatchDocs = evidence(args[0].documents, user);
            }
            result = engine.dispatchAction({ bookingId: b.id, documents: dispatchDocs });
            if (dispatchDocs.length > 0) {
              const currentNext = engine.getDataset();
              const docLabels = dispatchDocs.map(d => `${d.label} (${d.ref})`).join(', ');
              const docEvent = appendEvent(currentNext, {
                at: new Date().toISOString(),
                kind: 'load.documents-attached',
                actor: { kind: 'provider', name: user.name || user.email },
                summary: `Dispatch documentation attached: ${dispatchDocs[0].label}`,
                detail: docLabels,
                subjectIds: [b.id, b.materialId, b.receiverId],
              });
              nextOverride = { ...currentNext, events: [...currentNext.events, docEvent] };
            }
            break;
          }
          case 'createPaymentAttemptAction': {
            const b = receiverBooking(text(args[0].bookingId, 'booking ID', 250));
            const method = typeof args[0].method === 'string' && ['upi', 'card', 'netbanking'].includes(args[0].method) ? args[0].method : 'upi';
            const simulateOutcome = (args[0].simulateOutcome === 'manual' || args[0].simulateOutcome === 'qr_approval')
              ? 'manual'
              : args[0].simulateOutcome === 'failed'
                ? 'failed'
                : 'captured';
            result = paymentService.createAttempt({ booking: b, dataset, user, method, simulateOutcome });
            const event = appendEvent(dataset, { at: new Date().toISOString(), kind: 'payment.attempt-created', actor: { kind: 'receiver', name: user.name || user.email }, summary: 'Order payment started', detail: `Payment attempt ${result.attemptId} for ${result.amountMinor} minor units via ${method.toUpperCase()} (demo).`, subjectIds: [b.id] });
            nextOverride = { ...dataset, events: [...dataset.events, event] };
            break;
          }
          case 'disputePaymentAction': {
            const b = receiverBooking(text(args[0].bookingId, 'booking ID', 250));
            result = paymentService.dispute({ bookingId: b.id, userId: user.id, reason: text(args[0].reason ?? '', 'reason', 1000, true), booking: b });
            const event = appendEvent(dataset, { at: new Date().toISOString(), kind: 'payment.disputed', actor: { kind: 'receiver', name: user.name || user.email }, summary: 'Delivery payment disputed', detail: result.disputeReason, subjectIds: [b.id] });
            nextOverride = { ...dataset, events: [...dataset.events, event] };
            break;
          }
          case 'addOfferAction':
          case 'saveOfferDraftAction': {
            role('provider'); const o = args[0]; own(o.passportId, user); const m = dataset.materials.find(item => item.id === o.passportId); const d = dataset.demands.find(item => item.id === o.demandId);
            requireThat(d && m && !d.archivedAt && !m.archivedAt && ['OPEN', 'PARTIALLY_COVERED'].includes(d.status) && d.materialType === m.type, 'This request cannot accept that material.', 409);
            requireThat(m.listingStatus !== 'draft' && m.listingStatus !== 'paused' && m.listingStatus !== 'archived', 'Cannot create an offer with an asset that is in draft, paused, or archived.', 409);
            requireThat(!d.targetProviderId || (d.targetProviderId === user.email && d.targetMaterialId === m.id), 'This request is addressed to a different provider or material.', 403);
            if (action === 'addOfferAction') {
              const existingActiveOffer = (dataset.offers ?? []).find(
                item => item.demandId === d.id && item.passportId === m.id && item.providerId === user.email && item.status === 'pending'
              );
              requireThat(!existingActiveOffer, 'An active offer already exists for this material and request. Continue in Negotiations.', 409);
            }
            number(o.offeredQuantityT, 'offer quantity'); const committed = dataset.bookings.filter(b => b.materialId === m.id && b.status !== 'cancelled').reduce((sum, b) => sum + b.tonnesT, 0);
            requireThat(o.offeredQuantityT <= m.quantityT - committed, 'Offer exceeds available material.', 409);
            const offerInput = { demandId: d.id, passportId: m.id, offeredQuantityT: o.offeredQuantityT, providerId: user.email, ...(o.pricePerT === undefined ? {} : { pricePerT: number(o.pricePerT, 'price per tonne', true) }) };
            result = action === 'addOfferAction' ? engine.addOfferAction(offerInput) : engine.saveOfferDraftAction(offerInput);
            if (action === 'addOfferAction') {
              const providerUserId = datasetModel.ownerId(m.id);
              const receiverUserId = datasetModel.ownerId(d.receiverId);
              requireThat(providerUserId && receiverUserId && providerUserId !== receiverUserId, 'You cannot negotiate an offer with your own workspace.', 409);
              negotiationModel.ensure(result.id, providerUserId, receiverUserId, result.createdAt);
            }
            break;
          }
          case 'deleteOfferDraftAction': {
            role('provider'); const offerId = text(args[0], 'offer ID', 250); const item = dataset.offers.find(candidate => candidate.id === offerId);
            requireThat(item && item.status === 'draft', 'Only a saved draft offer can be deleted.', 409); own(item.passportId, user);
            result = engine.deleteOfferDraftAction(offerId); requireThat(result, 'This draft offer no longer exists.', 409); break;
          }
          case 'scheduleAcceptedOfferAction': {
            role('receiver');
            const item = acceptedOffersAwaitingBooking(dataset).find(candidate => candidate.id === args[0]);
            requireThat(item && !item.auctionId, 'This accepted offer is not awaiting a receiving slot.', 409);
            const demand = dataset.demands.find(candidate => candidate.id === item.demandId);
            own(demand.receiverId, user);
            const material = dataset.materials.find(candidate => candidate.id === item.passportId && !candidate.archivedAt);
            requireThat(material, 'Material passport not found or archived.', 404);
            const target = text(args[1], 'receiving slot ID or date', 250).trim();
            let slot = dataset.slots.find(candidate => candidate.id === target);
            if (!slot && /^\d{4}-\d{2}-\d{2}$/.test(target)) {
              const targetDate = target;
              requireThat(targetDate >= new Date().toISOString().slice(0, 10), 'Choose a receiving date in the future.', 400);
              requireThat(slotMatchesDemandPeriod({ date: targetDate }, demand.period), 'Choose a receiving date within the request period.', 409);
              requireThat(!material.availableFrom || targetDate >= material.availableFrom, 'The material is not available by this receiving date.', 409);
              slot = dataset.slots.find(s => s.receiverId === demand.receiverId && s.materialType === material.type && s.date === targetDate);
              if (!slot) {
                const receiver = dataset.receivers.find(r => r.id === demand.receiverId);
                requireThat(receiver, 'Receiver not found.', 404);
                if (receiver.acceptedTypes?.length && !receiver.acceptedTypes.includes(material.type) && !dataset.demands.some(d => d.receiverId === demand.receiverId && d.materialType === material.type)) {
                  throw new ApiError(409, 'Receiver does not accept this material type.');
                }
                const cap = receiver.dailyIntakeT && receiver.dailyIntakeT > 0 ? receiver.dailyIntakeT : 50;
                slot = engine.addCapacityAction({ receiverId: demand.receiverId, date: targetDate, materialType: material.type, capacityT: cap });
              }
            }
            requireThat(slot && slot.receiverId === demand.receiverId && slot.materialType === material.type, 'Choose a compatible receiving slot.', 409);
            requireThat(slot.date >= new Date().toISOString().slice(0, 10) && slotMatchesDemandPeriod(slot, demand.period) && (!material.availableFrom || slot.date >= material.availableFrom), 'Choose a receiving date within the request period and material availability.', 409);
            const materialCommitted = dataset.bookings.filter(booking => booking.materialId === material.id && booking.status !== 'cancelled').reduce((sum, booking) => sum + booking.tonnesT, 0);
            const demandCommitted = dataset.bookings.filter(booking => booking.demandId === demand.id && booking.status !== 'cancelled').reduce((sum, booking) => sum + booking.tonnesT, 0);
            const currentSlot = engine.getDataset().slots.find(s => s.id === slot.id) || slot;
            requireThat(item.offeredQuantityT <= material.quantityT - materialCommitted - (auctionService?.reservedT(material.id) ?? 0) && item.offeredQuantityT <= demand.requiredT - demandCommitted && item.offeredQuantityT <= availableT(currentSlot, engine.getDataset().bookings), 'The material, request, or receiving capacity is no longer available for this quantity.', 409);
            result = engine.acceptOfferAction(item.id, slot.id);
            break;
          }
          case 'acceptOfferAction': {
            const item = offer(args[0]);
            requireThat(!dataset.bookings.some(b => b.offerId === item.id && b.status !== 'cancelled'), 'An order has already been created for this offer.', 409);
            const demand = dataset.demands.find(d => d.id === item.demandId);
            const material = dataset.materials.find(m => m.id === item.passportId);
            requireThat(demand && material && !demand.archivedAt && !material.archivedAt && demand.status !== 'CANCELLED', 'The demand or material is no longer active.', 409);
            const committedMaterialT = dataset.bookings.filter(b => b.materialId === material.id && b.status !== 'cancelled').reduce((sum, b) => sum + b.tonnesT, 0) + (auctionService?.reservedT(material.id, item.auctionId) ?? 0);
            const committedDemandT = dataset.bookings.filter(b => b.demandId === demand.id && b.status !== 'cancelled').reduce((sum, b) => sum + b.tonnesT, 0);
            requireThat(item.offeredQuantityT <= material.quantityT - committedMaterialT, 'Offer exceeds available material inventory.', 409);
            requireThat(item.offeredQuantityT <= demand.requiredT - committedDemandT, 'Offer exceeds remaining request quantity.', 409);
            const receivingSlotId = args[1] ? text(args[1], 'receiving slot ID', 250) : undefined;
            const receiverSlots = dataset.slots.filter(s => s.receiverId === demand.receiverId && s.materialType === material.type);
            if (receivingSlotId || receiverSlots.length > 0) {
              const eligibleSlots = receiverSlots.filter(s => s.date >= new Date().toISOString().slice(0, 10) && slotMatchesDemandPeriod(s, demand.period) && (!material.availableFrom || s.date >= material.availableFrom) && (!receivingSlotId || s.id === receivingSlotId));
              requireThat(eligibleSlots.length > 0, 'Receiving slots for this material are expired or outside the demand period.', 409);
              const hasCapacity = eligibleSlots.some(s => availableT(s, dataset.bookings) >= item.offeredQuantityT);
              requireThat(hasCapacity, 'Receiving capacity is insufficient for this quantity.', 409);
            }
            result = engine.acceptOfferAction(item.id, receivingSlotId);
            requireThat(result, 'This offer could not be accepted.', 409);
            nextOverride = engine.getDataset();
            break;
          }
          case 'declineOfferAction': { const item=offer(args[0]); requireThat(!item.auctionId,'Auction awards cannot be declined through the offer action.',409); result = engine.declineOfferAction(args[0]); break; }
          case 'counterOfferAction': {
            throw new ApiError(409, 'Use Final Terms to propose a price, quantity, and receiving slot together.');
          }
          case 'sendNegotiationMessageAction': {
            const { offer, demand, material, participantRole } = negotiationContext(args[0]);
            requireThat(offer.status === 'pending', 'This negotiation is closed.', 409);
            const body = text(args[1], 'message', 4000);
            const at = new Date().toISOString();
            const senderName = user.name || user.organization || user.email;
            result = negotiationModel.addMessage({ offerId: offer.id, senderUserId: user.id, senderRole: participantRole, senderName, body, createdAt: at });
            const event = appendEvent(dataset, { at, kind: 'negotiation.message_sent', actor: { kind: participantRole === 'receiver' ? 'receiver' : 'contractor', name: senderName }, summary: `${participantRole === 'receiver' ? 'Receiver' : 'Provider'} sent a negotiation message`, subjectIds: [offer.id, demand.id, material.id] });
            nextOverride = { ...dataset, events: [...dataset.events, event] };
            break;
          }
          case 'proposeFinalTermsAction': {
            const { offer, demand, material, participantRole } = negotiationContext(args[0]);
            requireThat(offer.status === 'pending', 'This negotiation is closed.', 409);
            requireThat(!dataset.bookings.some(booking => booking.offerId === offer.id && booking.status !== 'cancelled'), 'An order has already been created for this offer.', 409);
            const terms = args[1];
            requireThat(terms && typeof terms === 'object' && !Array.isArray(terms), 'Invalid proposal terms.');
            const quantityT = number(terms.quantityT, 'quantity');
            const pricePerT = number(terms.pricePerT, 'price per tonne', true);
            requireThat(pricePerT > 0, 'Final Terms require a price greater than zero.');
            const destination = text(terms.destination, 'destination', 250);
            if (!offer.auctionId) requireThat(destination === demand.location, 'The final destination must match the receiver request.', 409);

            let slotId = typeof terms.slotId === 'string' ? terms.slotId.trim() : '';
            if (slotId && slotId !== 'unscheduled') {
              if (/^\d{4}-\d{2}-\d{2}$/.test(slotId)) {
                const targetDate = slotId;
                requireThat(targetDate >= new Date().toISOString().slice(0, 10), 'Choose a receiving date in the future.', 400);
                requireThat(slotMatchesDemandPeriod({ date: targetDate }, demand.period), 'Choose a receiving date within the receiver request period.', 409);
                requireThat(!material.availableFrom || targetDate >= material.availableFrom, 'The material is not available by this receiving date.', 409);
              } else {
                text(slotId, 'receiving slot ID', 250);
                const slot = dataset.slots.find(candidate => candidate.id === slotId);
                requireThat(slot && slot.receiverId === demand.receiverId && slot.materialType === material.type, 'Choose a compatible receiver slot.', 409);
                requireThat(slot.date >= new Date().toISOString().slice(0, 10) && slotMatchesDemandPeriod(slot, demand.period), 'Choose a receiving date within the receiver request period.', 409);
                requireThat(!material.availableFrom || slot.date >= material.availableFrom, 'The material is not available by this receiving date.', 409);
              }
            } else {
              slotId = 'unscheduled';
            }

            const committedMaterialT = dataset.bookings.filter(booking => booking.materialId === material.id && booking.status !== 'cancelled').reduce((sum, booking) => sum + booking.tonnesT, 0) + (auctionService?.reservedT(material.id, offer.auctionId) ?? 0);
            const committedDemandT = dataset.bookings.filter(booking => booking.demandId === demand.id && booking.status !== 'cancelled').reduce((sum, booking) => sum + booking.tonnesT, 0);
            requireThat(quantityT <= material.quantityT - committedMaterialT + 1e-9, 'The proposed quantity exceeds available material inventory.', 409);
            requireThat(quantityT <= demand.requiredT - committedDemandT + 1e-9, 'The proposed quantity exceeds remaining demand.', 409);

            const at = new Date().toISOString();
            result = negotiationModel.createProposal({ offerId: offer.id, proposedBy: participantRole, quantityT, pricePerT, destination, slotId, createdAt: at });
            const event = appendEvent(dataset, { at, kind: 'final_terms.proposed', actor: { kind: participantRole === 'receiver' ? 'receiver' : 'contractor', name: user.name || user.email }, summary: `${participantRole === 'receiver' ? 'Receiver' : 'Provider'} proposed Final Terms version ${result.version}`, subjectIds: [offer.id, demand.id, material.id] });
            nextOverride = { ...dataset, events: [...dataset.events, event] };
            break;
          }
          case 'approveFinalTermsAction': {
            const { offer, demand, material, participantRole } = negotiationContext(args[0]);
            requireThat(offer.status === 'pending', 'This negotiation is closed.', 409);
            requireThat(!dataset.bookings.some(booking => booking.offerId === offer.id && booking.status !== 'cancelled'), 'An order has already been created for this offer.', 409);
            const proposalId = text(args[1], 'proposal ID', 250);
            const proposal = negotiationModel.currentProposal(offer.id);
            requireThat(proposal && proposal.id === proposalId, 'Only the latest Final Terms version can be approved.', 409);
            const at = new Date().toISOString();
            requireThat(negotiationModel.approveProposal(offer.id, proposal.id, participantRole, at), 'This version is not awaiting your approval.', 409);
            const providerApprovedAt = participantRole === 'provider' ? at : proposal.providerApprovedAt;
            const receiverApprovedAt = participantRole === 'receiver' ? at : proposal.receiverApprovedAt;
            const bothApproved = Boolean(providerApprovedAt && receiverApprovedAt);
            if (bothApproved) negotiationModel.setProposalStatus(proposal.id, 'approved');
            let currentDataset = dataset;
            let booking;
            let capacityIssue;
            if (bothApproved) {
              const materialAvailableT = material.quantityT - dataset.bookings.filter(item => item.materialId === material.id && item.status !== 'cancelled').reduce((sum, item) => sum + item.tonnesT, 0) - (auctionService?.reservedT(material.id, offer.auctionId) ?? 0);
              const demandRemainingT = demand.requiredT - dataset.bookings.filter(item => item.demandId === demand.id && item.status !== 'cancelled').reduce((sum, item) => sum + item.tonnesT, 0);

              if (!offer.auctionId && proposal.destination !== demand.location) {
                capacityIssue = 'The receiver destination changed. Propose a new Final Terms version.';
              } else if (proposal.quantityT > materialAvailableT + 1e-9 || proposal.quantityT > demandRemainingT + 1e-9) {
                capacityIssue = 'Material or demand quantity changed. Propose a new Final Terms version.';
              } else if (proposal.slotId && proposal.slotId !== 'unscheduled') {
                let slot = dataset.slots.find(candidate => candidate.id === proposal.slotId);
                if (!slot && /^\d{4}-\d{2}-\d{2}$/.test(proposal.slotId)) {
                  const targetDate = proposal.slotId;
                  slot = dataset.slots.find(s => s.receiverId === demand.receiverId && s.materialType === material.type && s.date === targetDate);
                  if (!slot) {
                    const receiver = dataset.receivers.find(r => r.id === demand.receiverId);
                    const cap = receiver?.dailyIntakeT && receiver.dailyIntakeT > 0 ? receiver.dailyIntakeT : 50;
                    slot = engine.addCapacityAction({ receiverId: demand.receiverId, date: targetDate, materialType: material.type, capacityT: cap });
                    currentDataset = engine.getDataset();
                  }
                }
                const capacityAvailableT = slot ? availableT(slot, dataset.bookings) : 0;
                if (!slot || slot.receiverId !== demand.receiverId || slot.materialType !== material.type || slot.date < new Date().toISOString().slice(0, 10) || !slotMatchesDemandPeriod(slot, demand.period) || (material.availableFrom && slot.date < material.availableFrom)) {
                  capacityIssue = 'The approved receiving slot is no longer valid. Propose a new Final Terms version.';
                } else if (proposal.quantityT > capacityAvailableT) {
                  capacityIssue = 'The approved receiving slot no longer has enough capacity. Propose a new Final Terms version.';
                } else {
                  const reservation = requestCapacity(currentDataset, { materialId: material.id, receiverId: demand.receiverId, slotId: slot.id, tonnesT: proposal.quantityT, actor: { kind: 'system', name: 'GreenLoop' }, at });
                  if (reservation.output.outcome !== 'confirmed') {
                    capacityIssue = 'Capacity changed while confirming. Propose a new Final Terms version.';
                  } else {
                    const newBooking = reservation.output.booking;
                    booking = { ...newBooking, demandId: demand.id, receiverAcceptedAt: at, agreedPricePerT: proposal.pricePerT, offerId: offer.id, agreementVersionId: proposal.id };
                    const offerAccepted = { ...offer, status: 'accepted', agreedPricePerT: proposal.pricePerT, offeredQuantityT: proposal.quantityT };
                    currentDataset = {
                      ...reservation.dataset,
                      bookings: reservation.dataset.bookings.map(item => item.id === newBooking.id ? booking : item),
                      offers: (reservation.dataset.offers ?? []).map(item => item.id === offer.id ? offerAccepted : item),
                      events: reservation.dataset.events.map(event => event.subjectIds.includes(newBooking.allocationId) ? { ...event, subjectIds: [...new Set([...event.subjectIds, offer.id, demand.id, proposal.id, newBooking.id])] } : event),
                    };
                    negotiationModel.setProposalStatus(proposal.id, 'confirmed', booking.id);
                    const acceptedEvent = appendEvent(currentDataset, { at, kind: 'final_terms.confirmed', actor: { kind: 'system', name: 'GreenLoop' }, summary: `Final Terms version ${proposal.version} confirmed as booking ${booking.id}`, subjectIds: [offer.id, demand.id, material.id, proposal.id, slot.id, booking.id] });
                    currentDataset = { ...currentDataset, events: [...currentDataset.events, acceptedEvent] };
                    const coveredT = currentDataset.bookings.filter(item => item.demandId === demand.id && item.status === 'confirmed').reduce((sum, item) => sum + item.tonnesT, 0);
                    currentDataset.demands = currentDataset.demands.map(item => item.id !== demand.id || ['PAUSED', 'CANCELLED', 'DRAFT'].includes(item.status) ? item : { ...item, coveredT, status: coveredT >= item.requiredT ? 'COVERED' : coveredT > 0 ? 'PARTIALLY_COVERED' : 'OPEN' });
                  }
                }
              } else {
                // Unscheduled holding state: delivery details still need resolution!
                // Both parties approved commercial terms. Offer transitions to accepted awaiting receiving schedule.
                const offerAccepted = { ...offer, status: 'accepted', agreedPricePerT: proposal.pricePerT, offeredQuantityT: proposal.quantityT };
                currentDataset = {
                  ...currentDataset,
                  offers: (currentDataset.offers ?? []).map(item => item.id === offer.id ? offerAccepted : item),
                };
                const holdingEvent = appendEvent(currentDataset, { at, kind: 'offer.accepted', actor: { kind: 'system', name: 'GreenLoop' }, summary: `Final Terms version ${proposal.version} approved into unscheduled holding state awaiting delivery resolution`, subjectIds: [offer.id, demand.id, material.id, proposal.id] });
                currentDataset = { ...currentDataset, events: [...currentDataset.events, holdingEvent] };
                const coveredT = currentDataset.bookings.filter(item => item.demandId === demand.id && item.status === 'confirmed').reduce((sum, item) => sum + item.tonnesT, 0);
                currentDataset.demands = currentDataset.demands.map(item => item.id !== demand.id || ['PAUSED', 'CANCELLED', 'DRAFT'].includes(item.status) ? item : { ...item, coveredT, status: coveredT >= item.requiredT ? 'COVERED' : coveredT > 0 ? 'PARTIALLY_COVERED' : 'OPEN' });
              }
            }
            const approvalEvent = appendEvent(currentDataset, { at, kind: 'final_terms.approved', actor: { kind: participantRole === 'receiver' ? 'receiver' : 'contractor', name: user.name || user.email }, summary: `${participantRole === 'receiver' ? 'Receiver' : 'Provider'} approved Final Terms version ${proposal.version}`, subjectIds: [offer.id, demand.id, material.id, proposal.id, ...(booking ? [booking.id] : [])] });
            nextOverride = { ...currentDataset, events: [...currentDataset.events, approvalEvent] };
            result = { status: booking ? 'confirmed' : bothApproved ? (proposal.slotId && proposal.slotId !== 'unscheduled' ? 'approved' : 'holding') : proposal.status, ...(booking ? { bookingId: booking.id } : {}), ...(capacityIssue ? { capacityIssue } : {}) };
            break;
          }
          case 'cancelDemandAction': {
            role('receiver'); const demand = dataset.demands.find(item => item.id === text(args[0], 'request ID', 250));
            requireThat(demand, 'Request not found.', 404); own(demand.receiverId, user);
            requireThat(['OPEN', 'PARTIALLY_COVERED'].includes(demand.status), 'Only an open request can be cancelled.', 409);
            requireThat(!dataset.bookings.some(item => item.demandId === demand.id && item.status !== 'cancelled'), 'A request with active bookings cannot be cancelled.', 409);
            result = engine.cancelDemandAction(demand.id); break;
          }
          case 'withdrawOfferAction': {
            role('provider'); const offerId = text(args[0], 'offer ID', 250); const item = dataset.offers.find(candidate => candidate.id === offerId);
            requireThat(item && item.status === 'pending', 'Only a pending offer can be withdrawn.', 409); own(item.passportId, user);
            requireThat(!item.auctionId,'Auction awards cannot be withdrawn through the offer action.',409);
            result = engine.withdrawOfferAction(offerId); break;
          }
          case 'archiveBookingAction': {
            const actor = user.activeWorkspace === 'receiver' ? 'receiver' : 'provider';
            if (actor === 'receiver') receiverBooking(args[0]); else providerBooking(args[0]);
            const item = booking(text(args[0], 'booking ID', 250));
            requireThat(dataset.verifications.some(record => record.bookingId === item.id && record.status === 'verified'), 'Only a verified completed booking can be archived.', 409);
            requireThat(!item.archivedAt, 'This booking is already archived.', 409);
            result = engine.archiveBookingAction(item.id, actor); break;
          }
          case 'acceptRequestAction': { const b = receiverBooking(args[0]); requireThat(!b.loadRef, 'This load has already dispatched.', 409); if (args[1] !== null && args[1] !== undefined) number(args[1], 'accepted quantity'); result = engine.acceptRequestAction(b.id, args[1] ?? undefined); break; }
          case 'rejectRequestAction': { const b = receiverBooking(args[0]); requireThat(!b.loadRef, 'Dispatched loads must be verified instead.', 409); result = engine.rejectRequestAction(b.id); break; }
          case 'rescheduleRequestAction': {
            const isProvider = user.activeWorkspace === 'provider';
            const b = isProvider ? providerBooking(args[0]) : receiverBooking(args[0]);
            requireThat(!b.loadRef, 'Dispatched or delivered bookings cannot be rescheduled.', 409);
            const material = dataset.materials.find(m => m.id === b.materialId);
            requireThat(material && !material.archivedAt, 'Material passport not found or archived.', 404);
            const demand = b.demandId
              ? dataset.demands.find(d => d.id === b.demandId)
              : undefined;
            const targetParam = text(args[1], 'receiving slot ID or date', 250).trim();
            let targetSlot = dataset.slots.find(s => s.id === targetParam);
            if (!targetSlot && /^\d{4}-\d{2}-\d{2}$/.test(targetParam)) {
              const targetDate = targetParam;
              requireThat(targetDate >= new Date().toISOString().slice(0, 10), 'Choose a receiving date in the future.', 400);
              if (demand) requireThat(slotMatchesDemandPeriod({ date: targetDate }, demand.period), 'Choose a receiving date within the request period.', 409);
              if (material.availableFrom) requireThat(targetDate >= material.availableFrom, 'The material is not available by this receiving date.', 409);
              targetSlot = dataset.slots.find(s => s.receiverId === b.receiverId && s.materialType === material.type && s.date === targetDate);
              if (!targetSlot) {
                const receiver = dataset.receivers.find(r => r.id === b.receiverId);
                requireThat(receiver, 'Receiver not found.', 404);
                if (receiver.acceptedTypes?.length && !receiver.acceptedTypes.includes(material.type) && !dataset.demands.some(d => d.receiverId === b.receiverId && d.materialType === material.type)) {
                  throw new ApiError(409, 'Receiver does not accept this material type.');
                }
                const cap = receiver.dailyIntakeT && receiver.dailyIntakeT > 0 ? receiver.dailyIntakeT : 50;
                targetSlot = engine.addCapacityAction({ receiverId: b.receiverId, date: targetDate, materialType: material.type, capacityT: cap });
              }
            }
            requireThat(targetSlot, 'Receiving slot not found.', 404);
            requireThat(targetSlot.receiverId === b.receiverId && targetSlot.materialType === material.type, 'Choose a compatible receiving slot.', 409);
            requireThat(targetSlot.date >= new Date().toISOString().slice(0, 10), 'Choose a receiving date in the future.', 400);
            if (demand) requireThat(slotMatchesDemandPeriod(targetSlot, demand.period), 'Choose a receiving date within the request period.', 409);
            if (material.availableFrom) requireThat(targetSlot.date >= material.availableFrom, 'The material is not available by this receiving date.', 409);

            // Server-side conflict check: Never cancel or overwrite valid existing bookings
            const currentSlots = engine.getDataset().slots;
            const slotInCurrent = currentSlots.find(s => s.id === targetSlot.id) || targetSlot;
            const currentBookings = engine.getDataset().bookings;
            const avail = availableT(slotInCurrent, currentBookings.filter(item => item.id !== b.id));
            requireThat(b.tonnesT <= avail + 1e-9, 'Receiving capacity on this date is insufficient for this quantity.', 409);

            const committedMaterial = currentBookings.filter(item => item.id !== b.id && item.materialId === material.id && item.status !== 'cancelled').reduce((sum, item) => sum + item.tonnesT, 0);
            requireThat(b.tonnesT <= material.quantityT - committedMaterial + 1e-9, 'Material inventory is insufficient.', 409);

            if (demand) {
              const committedDemand = currentBookings.filter(item => item.id !== b.id && item.demandId === demand.id && item.status !== 'cancelled').reduce((sum, item) => sum + item.tonnesT, 0);
              requireThat(b.tonnesT <= demand.requiredT - committedDemand + 1e-9, 'Request quantity exceeds remaining demand.', 409);
            }

            result = engine.rescheduleRequestAction(b.id, targetSlot.id, isProvider ? 'provider' : 'receiver');
            requireThat(result, 'This booking could not be rescheduled.', 409);
            break;
          }
          case 'receiveLoadAction': {
            const b = receiverBooking(args[0]);
            requireThat(b.status === 'confirmed' && b.loadRef, 'Only confirmed dispatched loads can be received.', 409);
            requireThat(dataset.events.some(event => event.kind === 'load.dispatched' && event.subjectIds.includes(b.id)), 'Record dispatch before receiving this load.', 409);
            requireThat(!dataset.verifications.some(item => item.bookingId === b.id), 'This load has already been received.', 409);
            const actualT = number(args[1], 'received quantity', true);
            requireThat(actualT > 0, 'Received quantity must be greater than zero.');
            const evidenceList = evidence(args[2], user);
            requireThat(evidenceList.some(item => item.kind === 'weighbridge-ticket' && item.ref), 'A valid weighbridge ticket upload is required to receive this load.');
            result = engine.receiveLoadAction(b.id, actualT, evidenceList);
            requireThat(result, 'Failed to record load receipt.', 409);
            break;
          }
          case 'verifyLoadAction': {
            role('receiver'); const v = dataset.verifications.find(v => v.id === args[0]); requireThat(v, 'Receipt not found.', 404); own(v.receiverId, user);
            requireThat(v.status === 'pending', 'This receipt has already been verified.', 409);
            const ticket = v.evidence?.find(item => item.kind === 'weighbridge-ticket');
            const uploadId = ticket?.ref ? /^\/api\/uploads\/([\w-]+)$/.exec(ticket.ref)?.[1] : null;
            requireThat(uploadId && uploadModel.ownerId(uploadId) === user.id, 'Mandatory genuine weighbridge ticket is required for verification.', 409);
            number(args[1], 'accepted quantity', true); number(args[2], 'rejected quantity', true); requireThat(Math.abs(args[1] + args[2] - v.actualT) < 0.001, 'Accepted and rejected quantities must equal the received weight.');
            if (args[2] > 0) text(args[3], 'rejection reason', 1000); result = engine.verifyLoadAction(v.id, args[1], args[2], args[3]);
            requireThat(result, 'Failed to verify load receipt.', 409);
            break;
          }
          case 'verifyAction': {
            const b = receiverBooking(args[0].bookingId); requireThat(b.loadRef && !dataset.verifications.some(v => v.bookingId === b.id), 'Receive and verify each dispatched load only once.', 409);
            const p = args[0]; number(p.actualT, 'received quantity', true); number(p.acceptedT, 'accepted quantity', true); requireThat(p.acceptedT <= p.actualT, 'Accepted quantity exceeds received weight.');
            const rejectReason = text(p.rejectReason ?? '', 'rejection reason', 1000, p.acceptedT === p.actualT);
            result = engine.verifyAction({ bookingId: b.id, actualT: p.actualT, acceptedT: p.acceptedT, rejectReason, evidence: evidence(p.evidence ?? [], user) }); break;
          }
          case 'addSupportRequestAction': { const s = args[0]; result = engine.addSupportRequestAction({ email: user.email, subject: text(s.subject, 'subject', 250), message: text(s.message, 'message', 5000) }); assign(result.id, user); supportModel.ensureRequest(result); break; }
          case 'addMaterialEvidenceAction': {
            role('provider');
            const materialId = text(args[0], 'material ID', 250);
            own(materialId, user);
            const record = dataset.materials.find(item => item.id === materialId && !item.archivedAt);
            requireThat(record, 'Passport not found.', 404);
            const item = args[1];
            requireThat(item && typeof item === 'object', 'Evidence object required.', 400);
            const kind = choice(item.kind, ['survey-sheet', 'site-photo', 'lab-report', 'weighbridge-ticket', 'certificate', 'test-report', 'chain-of-custody'], 'document kind');
            const label = text(item.label, 'evidence label', 250);
            const ref = text(item.ref, 'evidence ref', 500);
            const uploadId = /^\/api\/uploads\/([\w-]+)$/.exec(ref)?.[1];
            requireThat(uploadId && uploadModel.ownerId(uploadId) === user.id, 'Uploaded evidence must exist and belong to the current user', 400);
            const isAlreadyAttached = (record.evidence ?? []).some(e => e.ref && ref && e.ref === ref);
            if (isAlreadyAttached) {
              result = record;
              nextOverride = { ...dataset };
              break;
            }
            const verified = Boolean(item.verified);
            const notes = item.notes ? text(item.notes, 'notes', 2000, true) : undefined;
            const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : undefined;
            const evidenceId = item.id || `EV-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            result = engine.addMaterialEvidenceAction(materialId, {
              id: evidenceId,
              kind,
              label,
              ref,
              verified,
              notes,
              metadata,
              status: 'pending',
              createdAt: new Date().toISOString(),
            });
            requireThat(result, 'Failed to attach evidence.', 400);
            break;
          }
          case 'removeMaterialEvidenceAction': {
            role('provider');
            const materialId = text(args[0], 'material ID', 250);
            own(materialId, user);
            const evidenceId = text(args[1], 'evidence reference or ID', 250);
            result = engine.removeMaterialEvidenceAction(materialId, evidenceId);
            requireThat(result, 'Evidence not found or could not be removed.', 404);
            break;
          }
          case 'submitPassportForReviewAction': {
            role('provider');
            const materialId = text(args[0], 'material ID', 250);
            own(materialId, user);
            const record = dataset.materials.find(item => item.id === materialId && !item.archivedAt);
            requireThat(record, 'Passport not found.', 404);
            requireThat(record.evidence && record.evidence.length > 0, 'Cannot submit passport without supporting evidence.', 400);
            const notes = args[1] ? text(args[1], 'submission notes', 2000, true) : undefined;
            result = engine.submitPassportForReviewAction(materialId, notes);
            requireThat(result, 'Failed to submit passport for review.', 400);
            break;
          }
          case 'reviewPassportAction': {
            const isReviewer = user.role === 'admin' || user.workspaces?.includes('receiver') || user.activeWorkspace === 'receiver';
            requireThat(isReviewer, 'Only authorized receivers or reviewers can verify passports.', 403);
            const input = args[0];
            requireThat(input && typeof input === 'object', 'Review payload required.', 400);
            const materialId = text(input.materialId, 'material ID', 250);
            const record = dataset.materials.find(item => item.id === materialId && !item.archivedAt);
            requireThat(record, 'Passport not found.', 404);
            requireThat(datasetModel.ownerId(materialId) !== user.id, 'Providers cannot verify their own material passports.', 403);
            const status = choice(input.status, ['verified', 'rejected', 'under-review'], 'verification status');
            const notes = input.notes ? text(input.notes, 'reviewer notes', 5000, true) : undefined;
            const rejectionReason = input.rejectionReason ? text(input.rejectionReason, 'rejection reason', 2000, true) : undefined;
            if (status === 'rejected') {
              requireThat(rejectionReason && rejectionReason.trim().length > 0, 'Rejection reason is mandatory when rejecting a passport.', 400);
            }
            if (status === 'verified') {
              const compliance = evaluatePassportCompliance(record);
              requireThat(compliance.missingMandatory.length === 0, `Cannot certify: missing mandatory evidence: ${compliance.missingMandatory.join(', ')}`, 400);
            }
            const evidenceReviews = Array.isArray(input.evidenceReviews)
              ? input.evidenceReviews.map(r => ({
                  refOrId: text(r.refOrId, 'evidence ID', 250),
                  status: choice(r.status, ['valid', 'rejected'], 'evidence status'),
                  notes: r.notes ? text(r.notes, 'evidence notes', 1000, true) : undefined,
                  rejectionReason: r.rejectionReason ? text(r.rejectionReason, 'rejection reason', 1000, true) : undefined,
                }))
              : (Array.isArray(input.evidenceChecks)
                ? input.evidenceChecks.map(r => ({
                    refOrId: text(r.evidenceId, 'evidence ID', 250),
                    status: choice(r.status, ['valid', 'rejected'], 'evidence status'),
                    notes: r.notes ? text(r.notes, 'evidence notes', 1000, true) : undefined,
                    rejectionReason: r.notes,
                  }))
                : undefined);
            result = engine.reviewPassportAction({
              materialId,
              status,
              notes,
              rejectionReason,
              reviewerName: user.name || user.organization || 'Receiver Reviewer',
              evidenceReviews,
            });
            requireThat(result, 'Failed to record review.', 400);
            break;
          }
          case 'updateMaterialPassportDetailsAction': {
            role('provider');
            const materialId = text(args[0], 'material ID', 250);
            own(materialId, user);
            const record = dataset.materials.find(item => item.id === materialId && !item.archivedAt);
            requireThat(record, 'Passport not found.', 404);
            const details = args[1];
            requireThat(details && typeof details === 'object', 'Passport details required.', 400);
            const validated = {};
            if (details.name !== undefined) validated.name = text(details.name, 'material name', 250, true);
            if (details.dimensions !== undefined) validated.dimensions = text(details.dimensions, 'dimensions', 250, true);
            if (details.surveyNotes !== undefined) validated.surveyNotes = text(details.surveyNotes, 'survey notes', 5000, true);
            if (details.provenance && typeof details.provenance === 'object') {
              validated.provenance = {
                ...(details.provenance.structureOfOrigin ? { structureOfOrigin: text(details.provenance.structureOfOrigin, 'structure', 250, true) } : {}),
                ...(details.provenance.yearBuilt !== undefined ? { yearBuilt: number(details.provenance.yearBuilt, 'year built', true) } : {}),
                ...(details.provenance.deconstructionMethod ? { deconstructionMethod: text(details.provenance.deconstructionMethod, 'deconstruction method', 250, true) } : {}),
                ...(details.provenance.previousUse ? { previousUse: text(details.provenance.previousUse, 'previous use', 500, true) } : {}),
                ...(details.provenance.handlingInstructions ? { handlingInstructions: text(details.provenance.handlingInstructions, 'handling instructions', 1000, true) } : {}),
              };
            }
            result = engine.updateMaterialPassportDetailsAction(materialId, validated);
            requireThat(result, 'Failed to update passport details.', 400);
            break;
          }
          default: throw new ApiError(404, 'Unknown operation.');
        }
        const next = nextOverride ?? engine.getDataset();
        requireThat(next !== dataset, 'This operation is no longer available. Refresh and check material, demand, and capacity limits.', 409);
        if (action === 'verifyAction') paymentService.afterVerification(next, args[0].bookingId);
        if (action === 'verifyLoadAction') {
          const verified = next.verifications.find(item => item.id === args[0]);
          if (verified) paymentService.afterVerification(next, verified.bookingId);
        }
        next.projects = next.projects.map(project => {
          const materialIds = new Set(next.materials.filter(material => material.projectId === project.id).map(material => material.id));
          const event = next.events.findLast(event => event.subjectIds.some(id => id === project.id || materialIds.has(id)));
          return event ? { ...project, lastActivityAt: event.at } : project;
        });
        next.receivers = next.receivers.map(r => ({ ...r,
          dailyIntakeT: Math.max(0, ...next.slots.filter(s => s.receiverId === r.id).map(s => next.slots.filter(x => x.receiverId === r.id && x.date === s.date).reduce((sum, x) => sum + x.capacityT, 0))),
          currentStockT: next.verifications.filter(v => v.receiverId === r.id && v.status === 'verified').reduce((sum, v) => sum + v.acceptedT, 0),
        }));
        datasetModel.save(next);
        if (action === 'approveFinalTermsAction' && result?.status === 'confirmed' && result.bookingId) auctionService?.completeForOffer(args[0], result.bookingId, new Date().toISOString());
        return { dataset: datasetService.visible(next, user), result: result ?? true };
      });
    },
  };
}
