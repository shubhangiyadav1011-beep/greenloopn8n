import { authRoutes } from './auth.routes.mjs';
import { datasetRoutes } from './dataset.routes.mjs';
import { actionRoutes } from './actions.routes.mjs';
import { uploadRoutes } from './uploads.routes.mjs';
import { paymentRoutes } from './payments.routes.mjs';
import { adminRoutes } from './admin.routes.mjs';
import { auctionsRoutes } from './auctions.routes.mjs';
import { monetizationRoutes } from './monetization.routes.mjs';
import { facilityResearchRoutes } from './facility-research.routes.mjs';

export function createRoutes({ authController, datasetController, actionsController, uploadsController, paymentsController, adminController, auctionsController, monetizationController, facilityResearchController, requireAuth, systemController }) {
  return [
    { method: 'GET', path: '/api/health', middleware: [], controller: systemController.health },
    ...authRoutes(authController),
    ...datasetRoutes(datasetController, requireAuth),
    ...actionRoutes(actionsController, requireAuth),
    ...uploadRoutes(uploadsController, requireAuth),
    ...paymentRoutes(paymentsController),
    ...adminRoutes(adminController, requireAuth),
    ...auctionsRoutes(auctionsController, requireAuth),
    ...monetizationRoutes(monetizationController, requireAuth),
    ...facilityResearchRoutes(facilityResearchController, requireAuth),
    { method: '*', path: '/api/*', middleware: [requireAuth], controller: () => false },
  ];
}
