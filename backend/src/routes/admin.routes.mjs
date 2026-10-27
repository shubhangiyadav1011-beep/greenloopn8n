export function adminRoutes(adminController, requireAuth) {
  return [{ method: '*', path: '/api/admin/*', middleware: [requireAuth], controller: adminController.handle }];
}
