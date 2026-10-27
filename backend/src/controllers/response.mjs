export function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

export function sendServiceResult(res, result) {
  if (result.headers) for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  if (result.redirect) {
    res.writeHead(result.status, { Location: result.redirect });
    return res.end();
  }
  sendJson(res, result.status, result.body);
}
