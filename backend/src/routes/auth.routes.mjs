export function authRoutes(authController) {
  return [
    ...['/api/config', '/api/auth/google', '/api/auth/google/callback', '/api/auth/me', '/api/auth/register', '/api/auth/login', '/api/auth/logout', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/demo-switch/:role']
      .map(path => ({ method: path === '/api/config' || path.endsWith('/google') || path.endsWith('/callback') || path.endsWith('/me') || path.includes('/demo-switch/') ? 'GET' : 'POST', path, middleware: [], controller: authController.handle })),
  ];
}
