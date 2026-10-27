export function datasetRoutes(datasetController, requireAuth) {
  return [
    { method: 'GET', path: '/api/dataset', middleware: [requireAuth], controller: datasetController.get },
    { method: 'PATCH', path: '/api/profile', middleware: [requireAuth], controller: datasetController.updateProfile },
    { method: 'POST', path: '/api/landed-cost', middleware: [requireAuth], controller: datasetController.landedCost },
  ];
}
