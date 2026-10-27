export function facilityResearchRoutes(controller, requireAuth) {
  return [
    { method: 'GET', path: '/api/facility-research/public-listings-status', middleware: [requireAuth], controller: controller.publicResearchStatus },
    { method: 'POST', path: '/api/facilities/:facilityId/research', middleware: [requireAuth], controller: controller.research },
    { method: 'POST', path: '/api/facilities/:facilityId/public-research', middleware: [requireAuth], controller: controller.publicResearch },
    { method: 'PUT', path: '/api/facilities/:facilityId/manual-details', middleware: [requireAuth], controller: controller.saveManualDetails },
  ];
}
