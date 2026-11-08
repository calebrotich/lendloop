/**
 * Read a request body with a hard byte ceiling.
 *
 * `Content-Length` is advisory (a chunked request can omit it), so the stream
 * itself is bounded. Used by the media upload proxy to avoid buffering an
 * arbitrarily large body before rejecting it.
 */
export async function readBoundedBody(
  request: Request,
  limit: number,
): Promise<ArrayBuffer | null> {
  if (request.body === null) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new ArrayBuffer(total);
  const view = new Uint8Array(body);
  let offset = 0;
  for (const chunk of chunks) {
    view.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
