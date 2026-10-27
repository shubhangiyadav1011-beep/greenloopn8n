// Do not send success or session cookies until the database COMMIT succeeds.
export function bufferedResponse(real) {
  const headers = {};
  let status = 200;
  let content;
  return {
    setHeader(name, value) { headers[name] = value; },
    writeHead(code, values = {}) { status = code; Object.assign(headers, values); },
    end(value) { content = value; },
    flush() { real.writeHead(status, headers); real.end(content); },
  };
}
