import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { requireThat } from '../validation.mjs';

const signatureFor = (secret, rawBody) => createHmac('sha256', secret).update(rawBody).digest('hex');

export function createMockPaymentProvider({ secret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET, outcome = process.env.MOCK_PAYMENT_OUTCOME ?? 'captured', delayMs = Number(process.env.MOCK_PAYMENT_DELAY_MS ?? 1800) } = {}) {
  requireThat(['captured', 'failed'].includes(outcome), 'MOCK_PAYMENT_OUTCOME must be captured or failed.', 500);
  requireThat(Number.isFinite(delayMs) && delayMs >= 0 && delayMs <= 60000, 'MOCK_PAYMENT_DELAY_MS must be between 0 and 60000.', 500);
  const webhookSecret = secret || 'greenloop-local-mock-provider-secret';

  const sign = event => signatureFor(webhookSecret, JSON.stringify(event));
  const schedule = (event, deliver) => {
    const timer = setTimeout(async () => {
      try {
        await deliver(event, sign(event));
      } catch (error) {
        if (!error?.message?.includes('database is not open')) {
          console.error('Mock payment webhook failed.', error);
        }
      }
    }, delayMs);
    timer.unref?.();
  };

  return {
    name: 'mock',
    sandbox: true,
    createPaymentIntent({ bookingId, amountMinor, currency, method = 'upi' }) {
      const providerReference = `mock_pay_${randomUUID()}`;
      const query = new URLSearchParams({ reference: providerReference, booking: bookingId, amount: String(amountMinor), currency, method });
      return { providerReference, qrPayload: `greenloop-mock://checkout?${query.toString()}` };
    },
    schedulePaymentResult({ providerReference, amountMinor, outcome: customOutcome }, deliver) {
      if (customOutcome === 'manual' || customOutcome === 'qr_approval') {
        return;
      }
      const chosenOutcome = customOutcome || outcome;
      schedule({ eventId: `mock_evt_${randomUUID()}`, type: chosenOutcome === 'failed' || chosenOutcome === 'payment.failed' ? 'payment.failed' : 'payment.captured', providerReference, amountMinor, providerName: 'mock', occurredAt: new Date().toISOString() }, deliver);
    },
    createPayout({ providerReference, amountMinor }, deliver) {
      const payoutReference = `mock_trf_${randomUUID()}`;
      schedule({ eventId: `mock_evt_${randomUUID()}`, type: 'transfer.settled', providerReference, transferReference: payoutReference, amountMinor, providerName: 'mock', occurredAt: new Date().toISOString() }, deliver);
      return payoutReference;
    },
    createRefund({ providerReference, amountMinor }, deliver) {
      const refundReference = `mock_ref_${randomUUID()}`;
      schedule({ eventId: `mock_evt_${randomUUID()}`, type: 'refund.processed', providerReference, refundReference, amountMinor, providerName: 'mock', occurredAt: new Date().toISOString() }, deliver);
      return refundReference;
    },
    verifyWebhook(rawBody, signature) {
      if (typeof signature !== 'string' || !/^[a-f\d]{64}$/i.test(signature)) return false;
      const expected = Buffer.from(signatureFor(webhookSecret, rawBody));
      const received = Buffer.from(signature.toLowerCase());
      return expected.length === received.length && timingSafeEqual(expected, received);
    },
    signWebhook: sign,
    payloadHash: rawBody => createHash('sha256').update(rawBody).digest('hex'),
  };
}
