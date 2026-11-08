/**
 * Public origin for links that leave the app: email CTAs, notification deep
 * links, and URLs handed to n8n. Each deployment overrides it with
 * `APP_BASE_URL`; this constant is the fallback when the variable is unset.
 */
export const DEFAULT_APP_BASE_URL = "https://lendloopnow.vercel.app";
