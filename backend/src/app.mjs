import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openDatabase } from './database/openDatabase.mjs';
import { ApiError, requireThat } from './validation.mjs';
import { createDatasetModel } from './models/dataset.model.mjs';
import { createSessionModel } from './models/session.model.mjs';
import { createUploadModel } from './models/upload.model.mjs';
import { createUserModel } from './models/user.model.mjs';
import { createNegotiationModel } from './models/negotiation.model.mjs';
import { createPaymentModel } from './models/payment.model.mjs';
import { createAdminModel } from './models/admin.model.mjs';
import { createSupportModel } from './models/support.model.mjs';
import { createAuctionModel } from './models/auction.model.mjs';
import { requireAuthentication } from './middleware/auth.middleware.mjs';
import { createSecurityMiddleware } from './middleware/security.middleware.mjs';
import { createActionService } from './services/action.service.mjs';
import { createAuthService } from './services/auth.service.mjs';
import { createDatasetService } from './services/dataset.service.mjs';
import { createUploadService } from './services/upload.service.mjs';
import { createPaymentService } from './services/payment.service.mjs';
import { createMockPaymentProvider } from './services/payment-provider.mock.mjs';
import { createActionsController } from './controllers/actions.controller.mjs';
import { createAuthController } from './controllers/auth.controller.mjs';
import { createDatasetController } from './controllers/dataset.controller.mjs';
import { createSystemController } from './controllers/system.controller.mjs';
import { createUploadsController } from './controllers/uploads.controller.mjs';
import { createPaymentsController } from './controllers/payments.controller.mjs';
import { createAdminController } from './controllers/admin.controller.mjs';
import { createAdminService } from './services/admin.service.mjs';
import { createAuctionService } from './services/auction.service.mjs';
import { createAuctionsController } from './controllers/auctions.controller.mjs';
import { createMonetizationModel } from './models/monetization.model.mjs';
import { createMonetizationService } from './services/monetization.service.mjs';
import { createMonetizationController } from './controllers/monetization.controller.mjs';
import { createFacilityResearchController } from './controllers/facility-research.controller.mjs';
import { createFacilityResearchService } from './services/facility-research.service.mjs';
import { createFacilityPublicResearchService } from './services/facility-public-research.service.mjs';
import { createRoutes } from './routes/index.mjs';
import { openPostgres } from './database/postgres.mjs';
import { bufferedResponse } from './controllers/bufferedResponse.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function matchRoute(route, method, path) {
  if (route.method !== '*' && route.method !== method) return null;
  if (route.path.endsWith('/*')) return path.startsWith(route.path.slice(0, -1)) ? {} : null;
  const names = [];
  const pattern = route.path.split('/').map(segment => {
    if (!segment.startsWith(':')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    names.push(segment.slice(1));
    return '([^/]+)';
  }).join('/');
  const matched = new RegExp(`^${pattern}$`).exec(path);
  if (!matched) return null;
  return Object.fromEntries(names.map((name, index) => [name, matched[index + 1]]));
}

function serveFrontend(req, res, path) {
  requireThat(['GET', 'HEAD'].includes(req.method), 'Method not allowed.', 405);
  const dist = resolve(root, 'frontend/dist');
  const requested = resolve(dist, `.${decodeURIComponent(path)}`);
  requireThat(requested.startsWith(dist + '/') || requested.startsWith(dist + '\\') || requested === dist, 'Invalid path.', 400);
  const staticFile = Boolean(extname(requested));
  if (staticFile) requireThat(existsSync(requested) && statSync(requested).isFile(), 'File not found.', 404);
  const file = staticFile ? requested : resolve(dist, path === '/' ? 'index.html' : 'app.html');
  requireThat(existsSync(file), 'Build the frontend with npm run build, or run npm run dev.', 404);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4' }[extname(file)] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' });
  res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
}

export function createBackend(options = {}) {
  const production = process.env.NODE_ENV === 'production';
  requireThat(!production || process.env.PUBLIC_ORIGIN?.startsWith('https://'), 'Set an HTTPS PUBLIC_ORIGIN for production.', 500);
  const dataDir = options.dataDir ?? resolve(root, 'server/data');
  const provider = options.databaseProvider ?? process.env.DATABASE_PROVIDER ?? (process.env.SUPABASE_DB_URL ? 'postgres' : 'sqlite');
  requireThat(['sqlite', 'postgres'].includes(provider), 'DATABASE_PROVIDER must be sqlite or postgres.', 500);
  mkdirSync(dataDir, { recursive: true });
  const postgres = provider === 'postgres' ? openPostgres(options.postgres) : null;
  const db = postgres ?? openDatabase(dataDir);
  // Keep Feature 1–6 auxiliary records on their current schema until matching
  // PostgreSQL migrations and model adapters are available for those tables.
  const featureDb = postgres ? openDatabase(dataDir) : db;
  const datasetModel = postgres?.datasetModel ?? createDatasetModel(db);
  const sessionModel = postgres?.sessionModel ?? createSessionModel(db);
  const uploadModel = postgres?.uploadModel ?? createUploadModel(db);
  const userModel = postgres?.userModel ?? createUserModel(db);
  const negotiationModel = postgres?.negotiationModel ?? createNegotiationModel(featureDb);
  const paymentModel = postgres?.paymentModel ?? createPaymentModel(featureDb);
  const adminModel = createAdminModel(featureDb);
  const supportModel = createSupportModel(featureDb);
  const auctionModel = createAuctionModel(featureDb);
  const monetizationModel = createMonetizationModel(featureDb);
  datasetModel.initialize();
  if (!postgres) supportModel.ensureRequests(datasetModel.load().supportRequests);

  const paymentProvider = options.paymentProvider ?? createMockPaymentProvider(options.paymentOptions);
  const paymentService = createPaymentService({ paymentModel, provider: paymentProvider, datasetModel,
    runWebhook: operation => postgres ? postgres.run(operation) : operation() });
  const monetizationService = createMonetizationService({ model: monetizationModel, provider: paymentProvider, datasetModel, userModel, adminModel, auctionModel });
  const datasetService = createDatasetService({ datasetModel, userModel, negotiationModel, paymentModel, supportModel, adminModel, auctionModel, monetizationService });
  const auctionService = createAuctionService({ auctionModel, datasetModel, datasetService, userModel, adminModel, negotiationModel, monetizationService });
  const authService = createAuthService({ userModel, sessionModel, datasetModel, dataDir, production, adminModel });
  const actionService = createActionService({ datasetModel, datasetService, userModel, uploadModel, negotiationModel, paymentService, supportModel, auctionService });
  const uploadService = createUploadService({ uploadModel, datasetService });
  const requireAuth = requireAuthentication(authService);
  const authController = createAuthController(authService);
  const datasetController = createDatasetController(datasetService);
  const actionsController = createActionsController(actionService);
  const uploadsController = createUploadsController(uploadService, postgres?.readUpload);
  const paymentsController = createPaymentsController(paymentService);
  const adminService = createAdminService({ adminModel, supportModel, userModel, sessionModel, datasetModel, negotiationModel, auctionService,
    paymentModel, monetizationService, paymentReady: Boolean(paymentProvider && typeof paymentProvider.createPaymentIntent === 'function') });
  const adminController = createAdminController(adminService);
  const auctionsController = createAuctionsController(auctionService);
  const systemController = createSystemController();
  const facilityResearchService = options.facilityResearchService ?? Object.assign(
    createFacilityResearchService({ datasetModel }), createFacilityPublicResearchService({ datasetModel }));
  const routes = createRoutes({ authController, datasetController, actionsController, uploadsController, paymentsController, adminController, auctionsController, monetizationController: createMonetizationController(monetizationService), facilityResearchController: createFacilityResearchController(facilityResearchService), requireAuth, systemController });
  const allowedOrigins = new Set(options.origins ?? (production ? [process.env.PUBLIC_ORIGIN] : [process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173', 'http://localhost:3001', 'http://localhost:4173', 'http://localhost:5199']));
  const security = createSecurityMiddleware({ allowedOrigins });

  const server = createServer(async (req, res) => {
    let path;
    const requestId = randomUUID();
    try {
      const url = new URL(req.url, 'http://localhost');
      path = url.pathname;
      security.apply(req, res);
      const response = bufferedResponse(res);
      const handle = async () => {
        if (path.startsWith('/api/')) supportModel.ensureRequests(datasetModel.load().supportRequests);
        for (const route of routes) {
          const params = matchRoute(route, req.method, path);
          if (params === null) continue;
          const context = { req, res: response, path, url, params, user: undefined };
          for (const middleware of route.middleware) await middleware(req, response, context);
          if (await route.controller(context)) return;
          break;
        }
        if (path.startsWith('/api/')) throw new ApiError(404, 'API endpoint not found.');
        serveFrontend(req, response, path);
      };
      if (postgres && path.startsWith('/api/')) await postgres.run(handle);
      else await handle();
      response.flush();
    } catch (error) {
      if (!res.headersSent) {
        const status = error.status ?? 500;
        const message = error.status ? error.message : 'An unexpected server error occurred.';
        if (status >= 500) {
          try { adminModel.addIncident({ requestId, occurredAt: new Date().toISOString(), method: req.method ?? 'UNKNOWN', route: path ?? '/', category: 'internal_error', statusCode: status }); } catch { /* Incident reporting must not mask the original failure. */ }
        }
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-Id': requestId });
        res.end(JSON.stringify({ error: message, requestId }));
      } else {
        res.end();
      }
      if (!error.status) console.error(error);
    }
  });
  server.on('close', () => {
    if (postgres) {
      Promise.resolve(postgres.close()).catch(error => console.error('Database close failed:', error.message));
      featureDb.close();
    } else db.close();
  });
  server.databaseReady = () => postgres ? postgres.run(() => undefined) : Promise.resolve();
  return server;
}
