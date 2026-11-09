/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as automation from "../automation.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_appUrl from "../lib/appUrl.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_emailTemplates from "../lib/emailTemplates.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_hmac from "../lib/hmac.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_loans from "../lib/loans.js";
import type * as lib_media from "../lib/media.js";
import type * as lib_mediaConstants from "../lib/mediaConstants.js";
import type * as lib_n8n from "../lib/n8n.js";
import type * as lib_outbox from "../lib/outbox.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_r2 from "../lib/r2.js";
import type * as media from "../media.js";
import type * as migrations from "../migrations.js";
import type * as requests from "../requests.js";
import type * as seed from "../seed.js";
import type * as toolImages from "../toolImages.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  automation: typeof automation;
  crons: typeof crons;
  http: typeof http;
  "lib/appUrl": typeof lib_appUrl;
  "lib/authz": typeof lib_authz;
  "lib/constants": typeof lib_constants;
  "lib/dates": typeof lib_dates;
  "lib/emailTemplates": typeof lib_emailTemplates;
  "lib/env": typeof lib_env;
  "lib/errors": typeof lib_errors;
  "lib/hmac": typeof lib_hmac;
  "lib/limits": typeof lib_limits;
  "lib/loans": typeof lib_loans;
  "lib/media": typeof lib_media;
  "lib/mediaConstants": typeof lib_mediaConstants;
  "lib/n8n": typeof lib_n8n;
  "lib/outbox": typeof lib_outbox;
  "lib/pricing": typeof lib_pricing;
  "lib/r2": typeof lib_r2;
  media: typeof media;
  migrations: typeof migrations;
  requests: typeof requests;
  seed: typeof seed;
  toolImages: typeof toolImages;
  tools: typeof tools;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
