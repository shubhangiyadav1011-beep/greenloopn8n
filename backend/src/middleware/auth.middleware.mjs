export function requireAuthentication(authService) {
  return (req, _res, context) => {
    req.user = authService.authenticate(req);
    context.user = req.user;
    return req.user;
  };
}
