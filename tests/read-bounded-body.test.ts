import { describe, expect, it } from "vitest";

import { readBoundedBody } from "../lib/read-bounded-body";

describe("readBoundedBody", () => {
  it("returns the exact bytes under the limit", async () => {
    const request = new Request("http://localhost/upload", {
      method: "POST",
      body: new Uint8Array([1, 2, 3, 4]),
    });

    const body = await readBoundedBody(request, 10);

    expect(body).not.toBeNull();
    expect(new Uint8Array(body ?? new ArrayBuffer(0))).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("rejects a body over the limit without buffering the rest", async () => {
    const request = new Request("http://localhost/upload", {
      method: "POST",
      body: new Uint8Array([1, 2, 3, 4, 5]),
    });

    await expect(readBoundedBody(request, 3)).resolves.toBeNull();
  });

  it("returns an empty buffer when there is no body", async () => {
    const request = new Request("http://localhost/upload", { method: "POST" });

    const body = await readBoundedBody(request, 10);

    expect(body?.byteLength).toBe(0);
  });
});
