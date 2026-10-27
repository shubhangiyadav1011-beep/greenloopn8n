import { randomUUID } from 'node:crypto';
import { choice, requireThat, text } from '../validation.mjs';
import { calculateLandedCost } from '../../../shared/domain/landedCost.ts';

export function createDatasetService({ datasetModel, userModel, negotiationModel, paymentModel, supportModel, adminModel, auctionModel, monetizationService }) {
  const visible = (dataset, user) => {
    dataset = { ...dataset, materials: dataset.materials.filter(item => !item.archivedAt), demands: dataset.demands.filter(item => !item.archivedAt), offers: (dataset.offers ?? []).filter(item => !item.archivedAt) };
    const mine = id => datasetModel.ownerId(id) === user.id;
    const receiving = user.activeWorkspace === 'receiver';
    const bookings = dataset.bookings.filter(b => receiving ? mine(b.receiverId) : mine(b.materialId));
    const offers = (dataset.offers ?? []).filter(o => receiving ? o.status !== 'draft' && mine(dataset.demands.find(d => d.id === o.demandId)?.receiverId) : o.providerId === user.email).map(offer => receiving && offer.status !== 'accepted' ? { ...offer, providerId: 'Provider' } : offer);
    const visibleOfferIds = new Set(offers.map(offer => offer.id));
    for (const offer of dataset.offers ?? []) {
      if (offer.status === 'draft') continue;
      const demand = dataset.demands.find(item => item.id === offer.demandId);
      const providerUserId = datasetModel.ownerId(offer.passportId);
      const receiverUserId = demand && datasetModel.ownerId(demand.receiverId);
      if (providerUserId && receiverUserId && providerUserId !== receiverUserId) {
        negotiationModel.ensure(offer.id, providerUserId, receiverUserId, offer.createdAt);
      }
    }
    const materials = dataset.materials.filter(m => (!receiving && mine(m.id)) || bookings.some(b => b.materialId === m.id) || offers.some(o => o.passportId === m.id));
    const subjects = new Set([...materials, ...bookings, ...offers, ...dataset.projects.filter(p => mine(p.id)), ...dataset.receivers.filter(r => mine(r.id)), ...dataset.demands.filter(d => mine(d.receiverId) || (!receiving && d.targetProviderId === user.email))].map(x => x.id));
    const slots = dataset.slots.filter(s => receiving || s.date >= new Date().toISOString().slice(0, 10) || bookings.some(b => b.slotId === s.id)).map(s => ({ ...s, reservedT: dataset.bookings.filter(b => b.slotId === s.id && b.status === 'confirmed' && !bookings.some(ownBooking => ownBooking.id === b.id)).reduce((total, b) => total + b.tonnesT, 0) }));
    const transactionContacts = bookings.filter(booking => booking.receiverAcceptedAt && booking.status !== 'cancelled').flatMap(booking => {
      const contactUserId = datasetModel.ownerId(receiving ? booking.materialId : booking.receiverId);
      const account = contactUserId && userModel.publicContact(contactUserId);
      if (!account) return [];
      const contact = account.profile;
      return [{ materialId: booking.materialId, receiverId: booking.receiverId, name: contact.name || contact.organization || 'Workspace contact', organization: contact.organization || contact.name || 'Organization', email: account.email, ...(contact.phone ? { phone: contact.phone } : {}) }];
    });
    const providerListings = receiving ? dataset.materials.flatMap(material => {
      const providerUserId = datasetModel.ownerId(material.id);
      const account = providerUserId && userModel.publicContact(providerUserId);
      const project = dataset.projects.find(item => item.id === material.projectId);
      if (!account || !project || material.archivedAt) return [];
      if (material.listingStatus === 'draft' || material.listingStatus === 'paused' || material.listingStatus === 'archived') return [];
      const profile = account.profile;
      const committedT = dataset.bookings.filter(booking => booking.materialId === material.id && booking.status !== 'cancelled').reduce((total, booking) => total + booking.tonnesT, 0);
      const availableT = Math.max(0, material.quantityT - committedT - (auctionModel?.reservedForMaterial(material.id) ?? 0));
      if (availableT <= 0) return [];
      return [{
        materialId: material.id,
        providerId: providerUserId,
        providerName: profile.name || profile.organization || 'Provider',
        organization: profile.organization || profile.name || 'Provider',
        location: profile.location || project.location,
        projectId: project.id,
        projectName: project.name,
        projectLocation: project.location,
        materialType: material.type,
        quantityT: material.quantityT,
        availableT,
        condition: material.condition,
        grade: material.grade,
        listingStatus: material.listingStatus || 'published',
        verificationStatus: material.verificationStatus ?? 'unverified',
        ...(material.name ? { name: material.name } : {}),
        ...(material.dimensions ? { dimensions: material.dimensions } : {}),
        ...(material.provenance ? { provenance: material.provenance } : {}),
        ...(material.verificationNotes ? { verificationNotes: material.verificationNotes } : {}),
        ...(material.rejectionReason ? { rejectionReason: material.rejectionReason } : {}),
        ...(material.verifiedAt ? { verifiedAt: material.verifiedAt } : {}),
        ...(material.verifiedBy ? { verifiedBy: material.verifiedBy } : {}),
        evidence: (material.evidence ?? []).map(e => ({
          kind: e.kind,
          label: e.label,
          recordedAt: e.recordedAt,
          ...(e.id ? { id: e.id } : {}),
          ...(e.ref ? { ref: e.ref } : {}),
          ...(e.status ? { status: e.status } : {}),
          ...(e.notes ? { notes: e.notes } : {}),
          ...(e.metadata ? { metadata: e.metadata } : {}),
        })),
        ...(material.surveyNotes ? { surveyNotes: material.surveyNotes } : {}),
        ...(material.confidence !== undefined ? { confidence: material.confidence } : {}),
        ...(material.quantityRangeT ? { quantityRangeT: material.quantityRangeT } : {}),
        ...(monetizationService?.listingMeta(material.id, providerUserId) ?? {}),
        ...(material.pricePerT !== undefined ? { pricePerT: material.pricePerT } : {}),
        ...(material.availableFrom ? { availableFrom: material.availableFrom } : {}),
        ...(material.geo || project.geo ? { geo: material.geo ?? project.geo } : {}),
      }];
    }) : [];
    const userSupportRequests = (dataset.supportRequests ?? []).filter(item => item.email === user.email);
    supportModel.ensureRequests(userSupportRequests);
    const ticketStatuses = supportModel.publicStatuses(userSupportRequests.map(item => item.id));
    return { ...dataset, providerListings, transactionContacts, negotiations: negotiationModel.listForUser(user.id, offers), readEventIds: user.readEventIds ?? [], projects: dataset.projects.filter(p => mine(p.id) || materials.some(m => m.projectId === p.id)), materials, slots, bookings,
      allocations: dataset.allocations.filter(a => bookings.some(b => b.allocationId === a.id)), offers,
      verifications: dataset.verifications.filter(v => bookings.some(b => b.id === v.bookingId)),
      events: dataset.events.filter(e => e.subjectIds.some(id => subjects.has(id))),
      demands: (receiving ? dataset.demands : dataset.demands.filter(d => (d.status !== 'DRAFT' && (!d.targetProviderId || d.targetProviderId === user.email)) || d.auctionId && visibleOfferIds.has((dataset.offers ?? []).find(o => o.demandId === d.id)?.id))).map(d => ({ ...d, coveredT: dataset.bookings.filter(b => b.demandId === d.id && b.status === 'confirmed').reduce((sum, b) => sum + b.tonnesT, 0) })),
      supportRequests: userSupportRequests.filter(s => mine(s.id)).map(request => {
        const ticket = ticketStatuses.get(request.id);
        return { ...request, status: ticket?.status ?? 'open', updatedAt: ticket?.updatedAt ?? request.submittedAt,
          ...(ticket?.resolvedAt ? { resolvedAt: ticket.resolvedAt } : {}) };
      }),
      payments: paymentModel.listForBookings(bookings.map(booking => booking.id), user.id) };
  };

  const updateProfile = (user, input) => datasetModel.transaction(() => {
    const current = userModel.findProfileById(user.id);
    for (const key of ['name', 'organization', 'location', 'vat', 'phone']) if (input[key] !== undefined) current[key] = text(input[key], key, 250, true);
    if (input.workspaces) {
      requireThat(Array.isArray(input.workspaces) && input.workspaces.length <= 2, 'Invalid workspaces.');
      current.workspaces = [...new Set([...current.workspaces, ...input.workspaces.map(role => choice(role, ['provider', 'receiver'], 'workspace'))])];
    }
    if (input.activeWorkspace) {
      requireThat(current.workspaces.includes(input.activeWorkspace), 'Enable this workspace first.', 403);
      current.activeWorkspace = input.activeWorkspace;
    }
    current.activeWorkspace ??= current.workspaces[0];
    const dataset = datasetModel.load();
    if (current.workspaces.includes('receiver') && !current.receiverId) {
      current.receiverId = `R-${randomUUID()}`;
      dataset.receivers.push({ id: current.receiverId, name: current.organization || current.name || current.email, location: current.location || '', dailyIntakeT: 0, currentStockT: 0, acceptedTypes: [], distanceKm: 0, distanceKnown: false, researchHistory: [], manualDetailsHistory: [] });
      datasetModel.assignOwner(current.receiverId, current.id);
    }
    if (input.websiteUrl !== undefined) {
      requireThat(current.receiverId, 'Enable the Receiver workspace before adding a facility website.', 400);
      const facilityUrl = text(input.websiteUrl, 'website URL', 2048, true);
      if (facilityUrl) {
        let parsed;
        try { parsed = new URL(facilityUrl); } catch { parsed = null; }
        requireThat(parsed?.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password, 'Enter a valid HTTPS facility website URL.');
      }
      const target = dataset.receivers.find(item => item.id === current.receiverId);
      requireThat(target, 'Receiver facility not found.', 404);
      if (facilityUrl) target.websiteUrl = facilityUrl;
      else delete target.websiteUrl;
    }
    if (current.receiverId) dataset.receivers = dataset.receivers.map(r => r.id === current.receiverId ? { ...r, name: current.organization || current.name || current.email, location: current.location || r.location } : r);
    datasetModel.save(dataset);
    userModel.updateProfile(current);
    const systemRole = adminModel.roleFor(current.id);
    return { ...current, ...(systemRole ? { systemRole } : {}) };
  });

  return {
    getVisibleDataset(user) {
      return visible(datasetModel.load(), user);
    },
    visible,
    updateProfile,
    calculateLandedCost(input) {
      requireThat(input && typeof input === 'object', 'Landed cost input object is required.', 400);
      let materialType = input.materialType;
      let pricePerT = input.pricePerT;
      let quantityT = input.quantityT;
      let distanceKm = input.distanceKm;
      let distanceKnown = input.distanceKnown;
      let destination = input.destination;

      const dataset = datasetModel.load();
      if (input.materialId) {
        const material = dataset.materials.find(m => m.id === input.materialId);
        if (material) {
          if (!materialType) materialType = material.type;
          if (pricePerT === undefined) pricePerT = material.pricePerT;
          if (quantityT === undefined) quantityT = material.quantityT;
        }
      }
      if (input.receiverId) {
        const receiver = dataset.receivers.find(r => r.id === input.receiverId);
        if (receiver) {
          if (distanceKm === undefined) distanceKm = receiver.distanceKm;
          if (distanceKnown === undefined) distanceKnown = receiver.distanceKnown;
          if (!destination) destination = receiver.location;
        }
      }

      requireThat(materialType && typeof materialType === 'string', 'Material type is required.', 400);
      const qty = Number(quantityT ?? 1);
      requireThat(Number.isFinite(qty) && qty >= 0, 'Quantity must be a non-negative number.', 400);

      return calculateLandedCost({
        materialType,
        quantityT: qty,
        pricePerT: pricePerT !== undefined && pricePerT !== null ? Number(pricePerT) : null,
        distanceKm: distanceKm !== undefined ? Number(distanceKm) : undefined,
        distanceKnown,
        transportCostPerT: input.transportCostPerT !== undefined ? Number(input.transportCostPerT) : undefined,
        handlingCostPerT: input.handlingCostPerT !== undefined ? Number(input.handlingCostPerT) : undefined,
        testingCostPerT: input.testingCostPerT !== undefined ? Number(input.testingCostPerT) : undefined,
        materialId: input.materialId,
        destination,
      });
    },
  };
}
