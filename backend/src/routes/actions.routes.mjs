export function actionRoutes(actionsController, requireAuth) {
  return [{ method: 'POST', path: '/api/actions', middleware: [requireAuth], controller: actionsController.handle }];
}
