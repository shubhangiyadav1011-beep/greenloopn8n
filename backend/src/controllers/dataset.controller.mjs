import { readJsonBody } from '../middleware/validation.middleware.mjs';
import { sendJson } from './response.mjs';

export function createDatasetController(datasetService) {
  return {
    async get({ req, res, user }) {
      if (req.method !== 'GET') return false;
      sendJson(res, 200, { dataset: datasetService.getVisibleDataset(user) });
      return true;
    },
    async updateProfile({ req, res, user }) {
      if (req.method !== 'PATCH') return false;
      const input = await readJsonBody(req);
      const updated = datasetService.updateProfile(user, input);
      sendJson(res, 200, { user: updated });
      return true;
    },
    async landedCost({ req, res, user }) {
      if (req.method !== 'POST') return false;
      const input = await readJsonBody(req);
      const calculation = datasetService.calculateLandedCost(input, user);
      sendJson(res, 200, { calculation });
      return true;
    },
  };
}
