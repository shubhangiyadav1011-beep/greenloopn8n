import { randomUUID } from 'node:crypto';
import { requireThat } from '../validation.mjs';

const now = () => new Date().toISOString();

export function createPaymentService({ paymentModel, provider, datasetModel, runWebhook = operation => operation() }) {
  const deliver = (event, signature) => runWebhook(() => processWebhook(Buffer.from(JSON.stringify(event)), signature));

  const processWebhook = (rawBody, signature) => {
    requireThat(provider.verifyWebhook(rawBody, signature), 'Invalid payment provider signature.', 401);
    let event;
    try { event = JSON.parse(rawBody.toString()); } catch { requireThat(false, 'Invalid payment event.', 400); }
    requireThat(event?.providerName === provider.name && typeof event.eventId === 'string' && typeof event.providerReference === 'string', 'Invalid payment event.', 400);
    return datasetModel.transaction(() => {
      const inserted = paymentModel.recordWebhookEvent({ eventId: event.eventId, providerName: provider.name, providerReference: event.providerReference, eventType: event.type, receivedAt: now(), payloadSha256: provider.payloadHash(rawBody) });
      if (!inserted) return { duplicate: true };
      const attempt = paymentModel.byProviderReference(event.providerReference);
      if (!attempt) return { ignored: true };
      const updateAt = now();
      if (event.type === 'payment.captured' || event.type === 'payment.failed') {
        if (event.amountMinor !== attempt.amountMinor || attempt.paymentStatus !== 'pending') return { ignored: true };
        paymentModel.update(attempt.attemptId, { payment_status: event.type === 'payment.captured' ? 'paid' : 'failed', updated_at: updateAt, ...(event.type === 'payment.captured' ? { paid_at: event.occurredAt ?? updateAt } : {}) });
        // Delivery may be verified before payment when dispatch happens first.
        if (event.type === 'payment.captured') service.afterVerification(datasetModel.load(), attempt.bookingId);
      } else if (event.type === 'refund.processed' || event.type === 'refund.failed') {
        if (event.amountMinor !== attempt.refundAmountMinor || attempt.refundStatus !== 'pending') return { ignored: true };
        paymentModel.update(attempt.attemptId, { refund_status: event.type === 'refund.processed' ? 'refunded' : 'failed', updated_at: updateAt });
      } else if (event.type === 'transfer.settled' || event.type === 'transfer.failed') {
        if (event.amountMinor !== attempt.payoutAmountMinor || attempt.payoutStatus !== 'pending') return { ignored: true };
        paymentModel.update(attempt.attemptId, { payout_status: event.type === 'transfer.settled' ? 'settled' : 'failed', payout_reference: event.transferReference, settled_at: event.type === 'transfer.settled' ? event.occurredAt ?? updateAt : null, updated_at: updateAt });
      }
      return { processed: true };
    });
  };

  const scheduleRefund = attempt => provider.createRefund({ providerReference: attempt.providerReference, amountMinor: attempt.refundAmountMinor }, deliver);
  const schedulePayout = attempt => provider.createPayout({ providerReference: attempt.providerReference, amountMinor: attempt.payoutAmountMinor }, deliver);

  const service = {
    createAttempt({ booking, dataset, user, method = 'upi', simulateOutcome }) {
      requireThat(booking.status === 'confirmed' && booking.receiverAcceptedAt, 'Payment is available only for a confirmed, receiver-accepted booking.', 409);
      const existing = paymentModel.latestForBooking(booking.id);
      if (existing?.paymentStatus === 'pending' || existing?.paymentStatus === 'paid' || existing?.paymentStatus === 'adjustment' || existing?.paymentStatus === 'disputed') return existing;
      const material = dataset.materials.find(item => item.id === booking.materialId);
      const offer = dataset.offers.find(item => item.id === booking.offerId) ?? dataset.offers.find(item => item.demandId === booking.demandId && item.passportId === booking.materialId);
      const pricePerT = Number(booking.agreedPricePerT ?? offer?.agreedPricePerT ?? offer?.pricePerT ?? material?.pricePerT);
      requireThat(Number.isFinite(pricePerT) && pricePerT > 0, 'A confirmed price per tonne is required before payment.', 409);
      const amountMinor = Math.round(booking.tonnesT * pricePerT * 100);
      requireThat(Number.isSafeInteger(amountMinor) && amountMinor > 0, 'The payable amount is invalid.', 409);
      const receiverUserId = datasetModel.ownerId(booking.receiverId);
      const providerUserId = datasetModel.ownerId(booking.materialId);
      requireThat(receiverUserId === user.id && providerUserId, 'Only the booking Receiver can initiate payment.', 403);
      const intent = provider.createPaymentIntent({ bookingId: booking.id, amountMinor, currency: 'INR', method });
      const attempt = paymentModel.createAttempt({ bookingId: booking.id, payerUserId: receiverUserId, providerUserId, providerName: provider.name, providerReference: intent.providerReference, qrPayload: intent.qrPayload, amountMinor, createdAt: now() });
      provider.schedulePaymentResult({ providerReference: intent.providerReference, amountMinor, outcome: simulateOutcome }, deliver);
      return attempt;
    },
    afterVerification(dataset, bookingId) {
      const attempt = paymentModel.latestForBooking(bookingId);
      const verification = dataset.verifications.find(item => item.bookingId === bookingId);
      if (!attempt || attempt.paymentStatus !== 'paid' || !verification || !['verified', 'rejected'].includes(verification.status)) return;
      const booking = dataset.bookings.find(item => item.id === bookingId);
      const acceptedT = Math.max(0, verification.acceptedT);
      const acceptedValueMinor = Math.round(acceptedT * Number(booking?.agreedPricePerT ?? dataset.materials.find(item => item.id === booking?.materialId)?.pricePerT ?? 0) * 100);
      const commissionMinor = Math.round(acceptedValueMinor * 0.05);
      const refundAmountMinor = Math.max(0, attempt.amountMinor - acceptedValueMinor);
      const payoutAmountMinor = Math.max(0, acceptedValueMinor - commissionMinor);
      const transitioned = paymentModel.prepareSettlement(attempt.attemptId, { payment_status: refundAmountMinor > 0 ? 'adjustment' : 'paid', updated_at: now(), accepted_t: acceptedT, accepted_value_minor: acceptedValueMinor, commission_minor: commissionMinor, provider_fee_minor: 0, refund_amount_minor: refundAmountMinor, refund_status: refundAmountMinor > 0 ? 'pending' : 'not_required', payout_amount_minor: payoutAmountMinor, payout_status: payoutAmountMinor > 0 ? 'pending' : 'not_eligible' });
      if (!transitioned) return;
      const updated = paymentModel.latestForBooking(bookingId);
      if (refundAmountMinor > 0) scheduleRefund(updated);
      if (payoutAmountMinor > 0) schedulePayout(updated);
    },
    dispute({ bookingId, userId, reason, booking }) {
      const attempt = paymentModel.latestForBooking(bookingId);
      requireThat(attempt && paymentModel.bookingPayer(bookingId) === userId, 'Payment record not found.', 404);
      requireThat(booking.loadRef && ['paid', 'adjustment'].includes(attempt.paymentStatus) && attempt.payoutStatus === 'held', 'A dispute can only hold payout before payout processing begins.', 409);
      const at = now();
      requireThat(paymentModel.markDisputed(attempt.attemptId, { disputed_at: at, dispute_reason: reason || 'Delivery disputed', updated_at: at }), 'Payout processing has already begun.', 409);
      return paymentModel.latestForBooking(bookingId);
    },
    getSession(providerReference) {
      const attempt = paymentModel.byProviderReference(providerReference);
      if (!attempt) return null;
      const dataset = datasetModel.load();
      const booking = dataset.bookings.find(b => b.id === attempt.bookingId);
      const material = dataset.materials.find(m => m.id === booking?.materialId);
      const project = dataset.projects.find(p => p.id === material?.projectId);
      return {
        reference: attempt.providerReference,
        attemptId: attempt.attemptId,
        bookingId: attempt.bookingId,
        merchantName: project?.name ? `${project.name} (GreenLoop Escrow)` : 'GreenLoop Escrow Services',
        materialName: material?.name || material?.type || 'Recovered Material',
        amountMinor: attempt.amountMinor,
        currency: 'INR',
        status: attempt.paymentStatus,
        paidAt: attempt.paidAt,
        transactionReference: attempt.paymentStatus === 'paid' ? `UPI-GL-${attempt.attemptId.slice(-8).toUpperCase()}` : undefined,
        createdAt: attempt.createdAt,
        isDemo: true,
      };
    },
    approveSession(providerReference) {
      const attempt = paymentModel.byProviderReference(providerReference);
      requireThat(attempt, 'Payment session not found.', 404);
      requireThat(attempt.paymentStatus === 'pending', 'Payment session is no longer pending.', 409);
      const updateAt = now();
      const txRef = `UPI-GL-${attempt.attemptId.slice(-8).toUpperCase()}`;
      paymentModel.update(attempt.attemptId, {
        payment_status: 'paid',
        updated_at: updateAt,
        paid_at: updateAt,
      });
      service.afterVerification(datasetModel.load(), attempt.bookingId);
      return {
        ...paymentModel.byProviderReference(providerReference),
        transactionReference: txRef,
      };
    },
    cancelSession(providerReference) {
      const attempt = paymentModel.byProviderReference(providerReference);
      requireThat(attempt, 'Payment session not found.', 404);
      requireThat(attempt.paymentStatus === 'pending', 'Payment session is no longer pending.', 409);
      const updateAt = now();
      paymentModel.update(attempt.attemptId, {
        payment_status: 'failed',
        updated_at: updateAt,
      });
      return paymentModel.byProviderReference(providerReference);
    },
    recordWebhook: processWebhook,
  };
  return service;
}
