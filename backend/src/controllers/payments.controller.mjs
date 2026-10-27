import { readRawBody } from '../middleware/validation.middleware.mjs';
import { sendJson } from './response.mjs';

export function createPaymentsController(paymentService) {
  return {
    async handleWebhook({ req, res }) {
      const rawBody = await readRawBody(req);
      const result = paymentService.recordWebhook(rawBody, req.headers['x-mock-provider-signature']);
      sendJson(res, 200, result);
      return true;
    },
    async getSession({ res, params }) {
      const session = paymentService.getSession(params.reference);
      if (!session) {
        sendJson(res, 404, { error: 'Payment session not found or expired.' });
        return true;
      }
      sendJson(res, 200, { session });
      return true;
    },
    async approveSession({ res, params }) {
      const result = paymentService.approveSession(params.reference);
      sendJson(res, 200, { success: true, session: result });
      return true;
    },
    async cancelSession({ res, params }) {
      const result = paymentService.cancelSession(params.reference);
      sendJson(res, 200, { success: true, session: result });
      return true;
    },
  };
}
