export function paymentRoutes(paymentsController) {
  return [
    { method: 'POST', path: '/api/payments/mock/webhook', middleware: [], controller: paymentsController.handleWebhook },
    { method: 'GET', path: '/api/payments/session/:reference', middleware: [], controller: paymentsController.getSession },
    { method: 'POST', path: '/api/payments/session/:reference/approve', middleware: [], controller: paymentsController.approveSession },
    { method: 'POST', path: '/api/payments/session/:reference/cancel', middleware: [], controller: paymentsController.cancelSession },
  ];
}
