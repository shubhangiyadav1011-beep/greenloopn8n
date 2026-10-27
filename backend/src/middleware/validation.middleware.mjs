import { ApiError, requireThat } from '../validation.mjs';

export async function readRawBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    requireThat(size <= 6 * 1024 * 1024, 'Request exceeds 6 MB.', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJsonBody(req) {
  try {
    const value = JSON.parse((await readRawBody(req)).toString() || '{}');
    requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Invalid request.');
    return value;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'Invalid JSON.');
  }
}
