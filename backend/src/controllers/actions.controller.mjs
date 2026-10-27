import { requireThat } from '../validation.mjs';
import { readJsonBody } from '../middleware/validation.middleware.mjs';
import { sendJson } from './response.mjs';

export function createActionsController(actionService) {
  return {
    async handle({ req, res, user }) {
      if (req.method !== 'POST') return false;
      const input = await readJsonBody(req);
      requireThat(Array.isArray(input.args) && input.args.length <= 4, 'Invalid arguments.');
      sendJson(res, 200, actionService.execute(user, input.action, input.args));
      return true;
    },
  };
}
