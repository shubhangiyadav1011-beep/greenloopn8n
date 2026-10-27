export function uploadRoutes(uploadsController, requireAuth) {
  return [
    { method: 'POST', path: '/api/uploads', middleware: [requireAuth], controller: uploadsController.create },
    { method: 'GET', path: '/api/uploads/:id', middleware: [requireAuth], controller: uploadsController.get },
  ];
}
