import { auth } from "@clerk/nextjs/server";
import { fetchAction } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LIMITS } from "@/convex/lib/limits";
import { isImageContentType } from "@/convex/lib/mediaConstants";
import { appErrorCode, appErrorMessage } from "@/lib/convex-error";
import { readBoundedBody } from "@/lib/read-bounded-body";

/**
 * Upload proxy for listing photos.
 *
 * The browser sends the file same-origin; this route authenticates the Clerk
 * session, asks Convex for a short-lived presigned PUT scoped to the caller's
 * own ticket, and streams the bytes to R2. The Convex action `completeUpload`
 * then verifies the stored object before it becomes visible.
 *
 * Why proxy instead of a direct browser → R2 PUT: the bucket does not need a
 * public CORS rule, R2 credentials never leave the Convex deployment, and the
 * 4 MB cap can be enforced before the file reaches storage. The cost is one
 * server hop for small images, which is a deliberate trade for a locked-down
 * bucket.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_ID = /^[a-z0-9]{8,64}$/;

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

function statusForCode(code: string | undefined): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "UNAVAILABLE":
      return 503;
    default:
      return 502;
  }
}

export async function POST(request: Request): Promise<Response> {
  const { userId, getToken } = await auth();
  if (userId === null) {
    return errorResponse("Sign in to add photos.", 401);
  }

  const uploadId = request.headers.get("x-lendloop-upload-id");
  if (uploadId === null || !UPLOAD_ID.test(uploadId)) {
    return errorResponse("Missing or invalid upload id.", 400);
  }

  const contentType =
    (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!isImageContentType(contentType)) {
    return errorResponse("Use a JPEG, PNG, WebP or AVIF image.", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > LIMITS.maxImageBytes) {
    return errorResponse("That photo is larger than 4 MB.", 413);
  }

  let token: string | null = null;
  try {
    token = await getToken({ template: "convex" });
  } catch (error) {
    console.error("Could not mint a Convex token for the upload proxy", error);
    return errorResponse("Your session expired. Refresh and try again.", 401);
  }
  if (token === null) {
    return errorResponse("Your session expired. Refresh and try again.", 401);
  }

  let target;
  try {
    target = await fetchAction(
      api.toolImages.prepareUpload,
      { uploadId: uploadId as Id<"toolImageUploads"> },
      { token },
    );
  } catch (error) {
    return errorResponse(
      appErrorMessage(error, "That upload is no longer available."),
      statusForCode(appErrorCode(error)),
    );
  }

  if (target.expiresAt <= Date.now()) {
    return errorResponse("That upload link expired. Try again.", 410);
  }
  if (target.contentType !== contentType) {
    return errorResponse("The photo type doesn't match the upload.", 415);
  }
  if (target.byteSize > LIMITS.maxImageBytes) {
    return errorResponse("That photo is larger than 4 MB.", 413);
  }

  let body: ArrayBuffer | null;
  try {
    body = await readBoundedBody(request, LIMITS.maxImageBytes);
  } catch (error) {
    console.error("Could not read the upload body", error);
    return errorResponse("The upload was interrupted. Try again.", 400);
  }
  if (body === null) {
    return errorResponse("That photo is larger than 4 MB.", 413);
  }
  if (body.byteLength === 0) {
    return errorResponse("The photo arrived empty.", 400);
  }
  if (body.byteLength !== target.byteSize) {
    return errorResponse("The photo changed before it finished uploading. Try again.", 400);
  }

  const storageHeaders = new Headers();
  for (const header of target.headers) {
    storageHeaders.set(header.name, header.value);
  }

  let storageResponse: Response;
  try {
    storageResponse = await fetch(target.url, {
      method: "PUT",
      headers: storageHeaders,
      body,
      cache: "no-store",
    });
  } catch (error) {
    console.error("R2 upload proxy could not reach storage", error);
    return errorResponse("Storage couldn't accept the photo. Try again.", 502);
  }

  if (!storageResponse.ok) {
    const detail = await storageResponse.text().catch(() => "");
    console.error("R2 upload proxy was rejected", storageResponse.status, detail.slice(0, 200));
    return errorResponse("Storage couldn't accept the photo. Try again.", 502);
  }

  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
