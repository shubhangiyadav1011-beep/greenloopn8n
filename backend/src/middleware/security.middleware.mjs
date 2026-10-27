import { requireThat } from '../validation.mjs';

export function createSecurityMiddleware({ allowedOrigins }) {
  const limits = new Map();
  return {
    apply(req, res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      if (!['GET', 'HEAD'].includes(req.method)) {
        const webhookPath = new URL(req.url, 'http://localhost').pathname;
        const providerWebhook = webhookPath === '/api/payments/mock/webhook' || webhookPath === '/api/monetization/mock/webhook' || webhookPath.startsWith('/api/payments/session/');
        if (!providerWebhook) requireThat(req.headers['x-greenloop-client'] === 'web', 'Missing request verification header.', 403);
        if (req.headers.origin) requireThat(allowedOrigins.has(req.headers.origin), 'Origin is not allowed.', 403);
        requireThat((req.headers['content-type'] ?? '').startsWith('application/json'), 'Send JSON requests.', 415);
      }
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path.startsWith('/api/auth/')) {
        const key = req.socket.remoteAddress;
        const now = Date.now();
        const count = limits.get(key);
        if (count && now - count.start < 60000) {
          requireThat(count.total < 60, 'Too many authentication attempts. Try again in a minute.', 429);
          count.total++;
        } else {
          limits.set(key, { start: now, total: 1 });
        }
        if (limits.size > 10000) for (const [address, item] of limits) if (now - item.start > 60000) limits.delete(address);
      }
    },
  };
}
