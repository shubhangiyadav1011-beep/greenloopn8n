import { readJsonBody } from '../middleware/validation.middleware.mjs';
import { sendJson } from './response.mjs';

const decode = value => { try { return decodeURIComponent(value); } catch { return value; } };

export function createAdminController(adminService) {
  return {
    async handle({ req, res, path, url, user }) {
      const parts = path.split('/').filter(Boolean).map(decode);
      const [, , section, id, action] = parts;
      let result;
      if (req.method === 'GET' && section === 'overview' && !id) result = adminService.overview(user);
      else if (req.method === 'GET' && section === 'users' && !id) result = adminService.users(user, url.searchParams.get('q'), Number(url.searchParams.get('page') ?? 1));
      else if (req.method === 'GET' && section === 'users' && id && !action) result = adminService.userDetail(user, id);
      else if (req.method === 'PATCH' && section === 'users' && id && action === 'status') { const body = await readJsonBody(req); result = adminService.setUserStatus(user, id, body.status, body.reason); }
      else if (req.method === 'PATCH' && section === 'users' && id && action === 'role') { const body = await readJsonBody(req); result = adminService.setStaffRole(user, id, body.role, body.reason); }
      else if (req.method === 'GET' && section === 'staff' && !id) result = adminService.staff(user);
      else if (req.method === 'GET' && section === 'support' && !id) result = adminService.supportQueue(user);
      else if (req.method === 'GET' && section === 'support' && id && !action) result = adminService.supportTicket(user, id);
      else if (req.method === 'PATCH' && section === 'support' && id) { const body = await readJsonBody(req); result = adminService.updateSupportTicket(user, id, body); }
      else if (req.method === 'GET' && section === 'orders' && !id) result = adminService.orders(user, url.searchParams.get('q'));
      else if (req.method === 'GET' && section === 'orders' && id) result = adminService.order(user, id);
      else if (req.method === 'GET' && section === 'auctions' && !id) result = adminService.auctions(user);
      else if (req.method === 'GET' && section === 'monetization' && !id) result = adminService.monetization(user);
      else if (req.method === 'POST' && section === 'monetization' && !id) { const body=await readJsonBody(req); result=adminService.setPremium(user,body.userId,body); }
      else if (req.method === 'GET' && section === 'health' && !id) result = adminService.health(user);
      else if (req.method === 'GET' && section === 'audit' && !id) result = adminService.auditLog(user);
      else return false;
      sendJson(res, 200, result);
      return true;
    },
  };
}
