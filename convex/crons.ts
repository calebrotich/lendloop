import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

/**
 * The outbox is drained every minute. Timing is deliberately not tied to the
 * loan lifecycle: mutations enqueue, the cron delivers, and retry backoff lives
 * on the row (`nextAttemptAt`), so a quiet deployment costs one no-op query.
 */
const crons = cronJobs();

crons.interval("drain automation outbox", { minutes: 1 }, internal.automation.drainOutbox, {});

/**
 * Media housekeeping has its own cadence: upload tickets are short-lived, and
 * deletes are idempotent retries. Fifteen minutes keeps orphaned objects from
 * lingering without adding load to the automation drain.
 */
crons.interval("clean up media", { minutes: 15 }, internal.media.cleanup, {});

export default crons;
