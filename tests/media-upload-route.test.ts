import type { IncomingHttpHeaders } from "node:http";
import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  fetchAction: vi.fn(),
  targetUrl: "",
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("convex/nextjs", () => ({ fetchAction: mocks.fetchAction }));

import { POST } from "../app/api/media/upload/route";

interface Received {
  headers: IncomingHttpHeaders;
  body: Buffer;
}

const received: Received[] = [];
let server: Server;

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({ headers: request.headers, body: Buffer.concat(chunks) });
      response.statusCode = 200;
      response.end("ok");
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Test server did not expose a port.");
  }
  mocks.targetUrl = `http://127.0.0.1:${address.port}/object`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
});

beforeEach(() => {
  received.length = 0;
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    userId: "user_1",
    getToken: async () => "convex-token",
  });
  mocks.fetchAction.mockResolvedValue({
    url: mocks.targetUrl,
    headers: [
      { name: "content-type", value: "image/webp" },
      { name: "cache-control", value: "public, max-age=86400" },
    ],
    contentType: "image/webp",
    byteSize: 4,
    expiresAt: Date.now() + 60_000,
  });
});

function uploadRequest(body: Uint8Array, uploadId = "abc12345") {
  const payload = new ArrayBuffer(body.byteLength);
  new Uint8Array(payload).set(body);
  return new Request("http://localhost/api/media/upload", {
    method: "POST",
    headers: {
      "content-type": "image/webp",
      "x-lendloop-upload-id": uploadId,
    },
    body: payload,
  });
}

describe("POST /api/media/upload", () => {
  it("forwards the exact bytes and signed headers to R2", async () => {
    const response = await POST(uploadRequest(new Uint8Array([1, 2, 3, 4])));

    expect(response.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0]?.body).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(received[0]?.headers["content-type"]).toContain("image/webp");
    expect(received[0]?.headers["cache-control"]).toContain("max-age=86400");
  });

  it("rejects an unauthenticated request before touching storage", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null, getToken: async () => null });

    const response = await POST(uploadRequest(new Uint8Array([1])));

    expect(response.status).toBe(401);
    expect(mocks.fetchAction).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it("rejects a missing or malformed upload id", async () => {
    const response = await POST(uploadRequest(new Uint8Array([1]), "bad id"));

    expect(response.status).toBe(400);
    expect(mocks.fetchAction).not.toHaveBeenCalled();
  });

  it("rejects a body that does not match the ticket size", async () => {
    const response = await POST(uploadRequest(new Uint8Array([1, 2, 3])));

    expect(response.status).toBe(400);
    expect(received).toHaveLength(0);
  });

  it("rejects a body over the 4 MB cap", async () => {
    const response = await POST(uploadRequest(new Uint8Array(4 * 1024 * 1024 + 1)));

    expect(response.status).toBe(413);
    expect(received).toHaveLength(0);
  });

  it("maps a Convex conflict to 409 and uses its safe copy", async () => {
    mocks.fetchAction.mockRejectedValueOnce({
      data: { code: "CONFLICT", message: "That upload link expired. Try again." },
    });

    const response = await POST(uploadRequest(new Uint8Array([1, 2, 3, 4])));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "That upload link expired. Try again.",
    });
  });
});
