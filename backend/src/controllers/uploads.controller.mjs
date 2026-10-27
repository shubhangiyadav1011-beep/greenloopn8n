import { readJsonBody } from '../middleware/validation.middleware.mjs';
import { sendJson } from './response.mjs';

export function createUploadsController(uploadService, readUpload) {
  return {
    async create({ req, res, user }) {
      if (req.method !== 'POST') return false;
      const input = await readJsonBody(req);
      sendJson(res, 201, uploadService.create(user, input));
      return true;
    },
    async get({ req, res, user, params }) {
      if (req.method !== 'GET') return false;
      const upload = uploadService.get(user, params.id);
      res.writeHead(200, {
        'Content-Type': upload.mime,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(upload.name)}`,
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      });
      res.end(readUpload ? await readUpload(upload) : Buffer.from(upload.content));
      return true;
    },
  };
}
