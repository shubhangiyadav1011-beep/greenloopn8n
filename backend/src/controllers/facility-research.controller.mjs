import { sendJson } from './response.mjs';
import { readJsonBody } from '../middleware/validation.middleware.mjs';

export function createFacilityResearchController(service) {
  return {
    async publicResearchStatus({ req, res }) {
      if (req.method !== 'GET') return false;
      sendJson(res, 200, { available: Boolean(service.publicListingsAvailable?.()) });
      return true;
    },
    async research({ req, res, params, user }) {
      if (req.method !== 'POST') return false;
      const result = await service.research(params.facilityId, user);
      sendJson(res, 200, { research: result });
      return true;
    },
    async publicResearch({ req, res, params, user }) {
      if (req.method !== 'POST') return false;
      sendJson(res, 200, { research: await service.publicListings(params.facilityId, user) });
      return true;
    },
    async saveManualDetails({ req, res, params, user }) {
      if (req.method !== 'PUT') return false;
      sendJson(res, 200, await service.saveManualDetails(params.facilityId, await readJsonBody(req), user));
      return true;
    },
  };
}
