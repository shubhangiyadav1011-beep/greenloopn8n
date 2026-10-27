import { sendJson } from './response.mjs';

export function createSystemController() {
  return {
    health({ res }) {
      sendJson(res, 200, { status: 'ok' });
      return true;
    },
  };
}
