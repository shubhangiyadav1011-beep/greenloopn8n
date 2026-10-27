import { readJsonBody } from '../middleware/validation.middleware.mjs';
import { sendServiceResult } from './response.mjs';

export function createAuthController(authService) {
  return {
    async handle({ req, res, path, url }) {
      const body = ['POST'].includes(req.method) && !['/api/auth/logout'].includes(path)
        ? await readJsonBody(req)
        : undefined;
      const result = await authService.handle(path, req, body, url);
      if (!result) return false;
      sendServiceResult(res, result);
      return true;
    },
  };
}
