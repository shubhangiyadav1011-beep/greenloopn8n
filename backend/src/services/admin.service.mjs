import { requireThat, text } from '../validation.mjs';

const allowedRoles = new Set(['super_admin', 'support_admin', 'operations_admin']);
const now = () => new Date().toISOString();
const cleanPage = value => Math.max(1, Math.min(10000, Number.isInteger(value) ? value : 1));

export function createAdminService({ adminModel, supportModel, userModel, sessionModel, datasetModel, negotiationModel, paymentModel, auctionService, monetizationService, supportRequests, paymentReady }) {
  const role = user => adminModel.roleFor(user.id);
  const authorize = (user, roles) => {
    const current = role(user);
    requireThat(current && roles.includes(current), 'Administrator access is required for this operation.', 403);
    requireThat(adminModel.statusFor(user.id) === 'active', 'This administrator account is suspended.', 403);
    return current;
  };
  const audit = (user, currentRole, entry) => adminModel.appendAudit({ actorUserId: user.id, actorRole: currentRole, occurredAt: now(), ...entry });
  const userSummary = userId => {
    const person = userModel.findProfileById(userId);
    if (!person) return undefined;
    return { id: person.id, email: person.email, name: person.name ?? '', organization: person.organization ?? '',
      workspaces: person.workspaces ?? [], systemRole: adminModel.roleFor(userId) ?? null, status: adminModel.statusFor(userId) };
  };
  const bookingSummary = (dataset, booking) => {
    const material = dataset.materials.find(item => item.id === booking.materialId);
    const providerUserId = datasetModel.ownerId(booking.materialId);
    const receiverUserId = datasetModel.ownerId(booking.receiverId);
    const provider = providerUserId && userSummary(providerUserId);
    const receiver = receiverUserId && userSummary(receiverUserId);
    const offer = dataset.offers.find(item => item.id === booking.offerId) ?? dataset.offers.find(item => item.id === booking.demandId && item.passportId === booking.materialId);
    const proposals = booking.offerId ? negotiationModel.proposalsFor(booking.offerId) : [];
    const verification = dataset.verifications.find(item => item.bookingId === booking.id);
    const payment = paymentModel.adminSummaryForBooking(booking.id);
    const events = dataset.events.filter(event => event.subjectIds.includes(booking.id)).map(event => ({ at: event.at, kind: event.kind, summary: event.summary }));
    return {
      booking: { id: booking.id, status: booking.status, tonnesT: booking.tonnesT, createdAt: booking.createdAt, updatedAt: booking.updatedAt,
        receiverAcceptedAt: booking.receiverAcceptedAt, loadRef: booking.loadRef, materialId: booking.materialId, receiverId: booking.receiverId,
        offerId: booking.offerId, agreementVersionId: booking.agreementVersionId, agreedPricePerT: booking.agreedPricePerT },
      participants: { provider: provider && { id: provider.id, name: provider.name, organization: provider.organization, email: provider.email }, receiver: receiver && { id: receiver.id, name: receiver.name, organization: receiver.organization, email: receiver.email } },
      material: material ? { type: material.type, projectId: material.projectId } : undefined,
      negotiation: { offerId: booking.offerId, offerStatus: offer?.status, approvedVersion: proposals.find(item => item.id === booking.agreementVersionId), versions: proposals },
      dispatch: { dispatched: Boolean(booking.loadRef), loadReference: booking.loadRef, events },
      delivery: verification ? { id: verification.id, status: verification.status, plannedT: verification.plannedT, actualT: verification.actualT,
        acceptedT: verification.acceptedT, rejectedT: verification.rejectedT, verifiedAt: verification.verifiedAt } : undefined,
      payment: payment ? { attemptId: payment.attemptId, provider: payment.provider, providerReference: payment.providerReference,
        amountMinor: payment.amountMinor, currency: payment.currency, paymentStatus: payment.paymentStatus, createdAt: payment.createdAt,
        updatedAt: payment.updatedAt, paidAt: payment.paidAt, acceptedT: payment.acceptedT, acceptedValueMinor: payment.acceptedValueMinor,
        commissionMinor: payment.commissionMinor, providerFeeMinor: payment.providerFeeMinor, refundAmountMinor: payment.refundAmountMinor,
        refundStatus: payment.refundStatus, payoutAmountMinor: payment.payoutAmountMinor, payoutStatus: payment.payoutStatus,
        disputedAt: payment.disputedAt, disputeReason: payment.disputeReason } : undefined,
    };
  };
  const findOrders = (query, userId) => {
    const dataset = datasetModel.load();
    const q = String(query ?? '').trim().toLowerCase();
    return dataset.bookings.filter(booking => {
      if (userId && datasetModel.ownerId(booking.receiverId) !== userId && datasetModel.ownerId(booking.materialId) !== userId) return false;
      if (!q) return true;
      const material = dataset.materials.find(item => item.id === booking.materialId);
      const providerId = datasetModel.ownerId(booking.materialId);
      const receiverId = datasetModel.ownerId(booking.receiverId);
      const provider = providerId && userModel.findProfileById(providerId);
      const receiver = receiverId && userModel.findProfileById(receiverId);
      return [booking.id, booking.loadRef, booking.materialId, booking.offerId, booking.agreementVersionId, provider?.email, receiver?.email, material?.type]
        .some(value => String(value ?? '').toLowerCase().includes(q));
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100).map(booking => bookingSummary(dataset, booking));
  };

  return {
    role,
    authorize,
    overview(user) {
      const currentRole = authorize(user, ['super_admin', 'support_admin', 'operations_admin']);
      const tickets = supportModel.list();
      const dataset = datasetModel.load();
      const result = { role: currentRole, counts: {
        ...(currentRole !== 'operations_admin' ? { openTickets: tickets.filter(ticket => ticket.status !== 'resolved').length } : {}),
        ...(currentRole === 'super_admin' ? { users: adminModel.userCount() } : {}),
        ...(currentRole !== 'support_admin' ? {
          activeOrders: dataset.bookings.filter(item => item.status !== 'cancelled').length,
          disputes: dataset.bookings.filter(item => paymentModel.adminSummaryForBooking(item.id)?.paymentStatus === 'disputed').length,
        } : {}),
      } };
      audit(user, currentRole, { action: 'view_admin_overview', targetType: 'admin_dashboard', targetId: 'overview', reason: 'Read-only operational summary', after: result.counts });
      return result;
    },
    users(user, query, page) {
      authorize(user, ['super_admin']);
      const p = cleanPage(page);
      const pageRows = adminModel.listUsers(String(query ?? '').slice(0, 100), 51, (p - 1) * 50);
      const users = pageRows.slice(0, 50);
      audit(user, role(user), { action: 'inspect_user_list', targetType: 'user_collection', targetId: 'users', reason: 'Read-only user directory query', after: { page: p, resultCount: users.length } });
      return { users, page: p, pageSize: 50, hasMore: pageRows.length > 50 };
    },
    userDetail(user, targetId) {
      const currentRole = authorize(user, ['super_admin']);
      const target = userSummary(targetId);
      requireThat(target, 'User not found.', 404);
      audit(user, currentRole, { action: 'inspect_user', targetType: 'user', targetId, reason: 'Read-only account inspection', after: { status: target.status, systemRole: target.systemRole } });
      return { user: target };
    },
    setUserStatus(user, targetId, status, rawReason) {
      const currentRole = authorize(user, ['super_admin']);
      requireThat(['active', 'suspended'].includes(status), 'Invalid account status.', 400);
      const reason = text(rawReason, 'reason', 1000);
      const before = userSummary(targetId);
      requireThat(before, 'User not found.', 404);
      requireThat(targetId !== user.id || status !== 'suspended', 'You cannot suspend your own administrator account.', 409);
      if (before.systemRole === 'super_admin' && status === 'suspended') {
        const activeSuperAdmins = adminModel.listRoles().filter(item => item.role === 'super_admin' && adminModel.statusFor(item.userId) === 'active');
        requireThat(activeSuperAdmins.length > 1, 'The last active Super Admin cannot be suspended.', 409);
      }
      datasetModel.transaction(() => {
        adminModel.setAccountStatus({ userId: targetId, status, updatedAt: now(), actorId: user.id, reason });
        if (status === 'suspended') sessionModel.deleteForUser(targetId);
        const after = userSummary(targetId);
        audit(user, currentRole, { action: status === 'suspended' ? 'suspend_user' : 'reactivate_user', targetType: 'user', targetId, reason,
          before: { status: before.status }, after: { status: after.status } });
      });
      return { user: userSummary(targetId) };
    },
    setStaffRole(user, targetId, nextRole, rawReason) {
      const currentRole = authorize(user, ['super_admin']);
      const reason = text(rawReason, 'reason', 1000);
      requireThat(nextRole === null || allowedRoles.has(nextRole), 'Invalid staff role.', 400);
      requireThat(targetId !== user.id, 'You cannot change your own staff role.', 409);
      const target = userSummary(targetId);
      requireThat(target, 'User not found.', 404);
      if (target.systemRole === 'super_admin' && nextRole !== 'super_admin') {
        const superAdmins = adminModel.listRoles().filter(item => item.role === 'super_admin' && adminModel.statusFor(item.userId) === 'active');
        requireThat(superAdmins.length > 1, 'The last Super Admin cannot be demoted.', 409);
      }
      const before = { systemRole: target.systemRole };
      datasetModel.transaction(() => {
        if (nextRole) adminModel.assignRole(targetId, nextRole, user.id, now()); else adminModel.revokeRole(targetId);
        const after = { systemRole: nextRole };
        audit(user, currentRole, { action: nextRole ? 'assign_staff_role' : 'revoke_staff_role', targetType: 'user', targetId, reason, before, after });
      });
      return { user: userSummary(targetId) };
    },
    staff(user) {
      const currentRole = authorize(user, ['super_admin', 'support_admin']);
      const staff = adminModel.listRoles().filter(item => adminModel.statusFor(item.userId) === 'active');
      audit(user, currentRole, { action: 'inspect_staff_directory', targetType: 'admin_collection', targetId: 'staff', reason: 'Read-only active staff directory', after: { resultCount: staff.length } });
      return { staff };
    },
    supportQueue(user) {
      const currentRole = authorize(user, ['super_admin', 'support_admin']);
      const dataset = datasetModel.load();
      const records = new Map((dataset.supportRequests ?? []).map(item => [item.id, item]));
      const tickets = supportModel.list().map(ticket => ({ ...ticket, subject: records.get(ticket.ticketId)?.subject ?? '(No subject)', message: records.get(ticket.ticketId)?.message ?? '' }));
      audit(user, currentRole, { action: 'inspect_support_queue', targetType: 'support_collection', targetId: 'support', reason: 'Read-only support queue inspection', after: { resultCount: tickets.length } });
      return { tickets };
    },
    supportTicket(user, ticketId) {
      const currentRole = authorize(user, ['super_admin', 'support_admin']);
      const ticket = supportModel.get(ticketId);
      requireThat(ticket, 'Support request not found.', 404);
      const record = (datasetModel.load().supportRequests ?? []).find(item => item.id === ticketId);
      requireThat(record, 'Support request not found.', 404);
      const orders = findOrders('', ticket.requesterUserId).map(item => ({ booking: item.booking, payment: item.payment, delivery: item.delivery,
        participants: item.participants, dispatch: item.dispatch }));
      audit(user, currentRole, { action: 'inspect_support_ticket', targetType: 'support_ticket', targetId: ticketId, reason: 'Read-only support ticket inspection' });
      return { ticket: { ...ticket, subject: record.subject, message: record.message }, requester: {
        id: ticket.requesterUserId, email: ticket.requesterEmail, name: ticket.requesterName, organization: ticket.requesterOrganization, status: ticket.accountStatus,
      }, relatedOrders: orders };
    },
    updateSupportTicket(user, ticketId, input) {
      const currentRole = authorize(user, ['super_admin', 'support_admin']);
      const reason = text(input.reason, 'reason', 1000);
      const before = supportModel.get(ticketId);
      requireThat(before, 'Support request not found.', 404);
      let assignedAdminUserId = input.assignedAdminUserId;
      if (assignedAdminUserId !== undefined && assignedAdminUserId !== null && assignedAdminUserId !== '') {
        const assignee = adminModel.listRoles().find(item => item.userId === assignedAdminUserId);
        requireThat(assignee && adminModel.statusFor(assignedAdminUserId) === 'active', 'Choose an active administrator.', 400);
      } else if (assignedAdminUserId === '') assignedAdminUserId = null;
      const status = input.status;
      requireThat(status === undefined || ['open', 'in_review', 'waiting', 'resolved'].includes(status), 'Invalid support status.', 400);
      const noteBody = input.note === undefined ? undefined : text(input.note, 'internal note', 5000);
      const after = datasetModel.transaction(() => {
        const updated = supportModel.update({ ticketId, status, assignedAdminUserId, at: now() });
        if (noteBody) supportModel.addNote({ ticketId, authorUserId: user.id, body: noteBody, createdAt: now() });
        audit(user, currentRole, { action: noteBody ? 'update_support_ticket_and_note' : 'update_support_ticket', targetType: 'support_ticket', targetId: ticketId, reason,
          before: { status: before.status, assignedAdminUserId: before.assignedAdminUserId ?? null, resolvedAt: before.resolvedAt ?? null },
          after: { status: updated.status, assignedAdminUserId: updated.assignedAdminUserId ?? null, resolvedAt: updated.resolvedAt ?? null, internalNoteAdded: Boolean(noteBody) } });
        return supportModel.get(ticketId);
      });
      return { ticket: after };
    },
    orders(user, query) {
      const currentRole = authorize(user, ['super_admin', 'operations_admin']);
      const orders = findOrders(query).map(({ booking, participants, material, delivery, payment, dispatch }) => ({ booking, participants, material,
        delivery: delivery && { status: delivery.status, acceptedT: delivery.acceptedT, rejectedT: delivery.rejectedT },
        payment: payment && { paymentStatus: payment.paymentStatus, refundStatus: payment.refundStatus, payoutStatus: payment.payoutStatus },
        dispatch: { dispatched: dispatch.dispatched, loadReference: dispatch.loadReference } }));
      audit(user, currentRole, { action: 'inspect_order_list', targetType: 'booking_collection', targetId: 'orders', reason: 'Read-only order search', after: { resultCount: orders.length } });
      return { orders };
    },
    order(user, bookingId) {
      const currentRole = authorize(user, ['super_admin', 'operations_admin']);
      const found = findOrders(bookingId).find(item => item.booking.id === bookingId || item.booking.loadRef === bookingId || item.booking.materialId === bookingId);
      requireThat(found, 'Order not found.', 404);
      audit(user, currentRole, { action: 'inspect_order', targetType: 'booking', targetId: found.booking.id, reason: 'Read-only transaction inspection' });
      return { order: found };
    },
    auctions(user) {
      const currentRole = authorize(user, ['super_admin', 'operations_admin']);
      const auctions = auctionService.adminList();
      audit(user, currentRole, { action: 'inspect_auctions', targetType: 'auction_collection', targetId: 'auctions', reason: 'Read-only auction inspection', after: { resultCount: auctions.length } });
      return { auctions };
    },
    monetization(user) { return monetizationService.adminList(user); },
    setPremium(user,targetId,input) { return monetizationService.adminEntitlement(user,targetId,input); },
    health(user) {
      const currentRole = authorize(user, ['super_admin', 'operations_admin']);
      let databaseReady = false;
      try { databaseReady = adminModel.databaseReady(); } catch { /* Health response intentionally omits database details. */ }
      let incidents = [];
      try { incidents = adminModel.listIncidents(25); } catch { /* Keep a database failure visible in readiness status. */ }
      const result = { api: 'available', database: databaseReady ? 'ready' : 'unavailable', paymentService: paymentReady ? 'ready' : 'unavailable', incidents };
      audit(user, currentRole, { action: 'inspect_system_health', targetType: 'system', targetId: 'health', reason: 'Read-only service readiness inspection', after: { api: result.api, database: result.database, paymentService: result.paymentService } });
      return result;
    },
    auditLog(user) { authorize(user, ['super_admin']); return { entries: adminModel.listAudit(200) }; },
  };
}
