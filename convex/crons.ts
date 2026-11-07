import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

/**
 * The outbox is drained every minute. Timing is deliberately not tied to the
 * loan lifecycle: mutations enqueue, the cron delivers, and retry backoff lives
 * on the row (`nextAttemptAt`), so a quiet deployment costs one no-op query.
 */
const crons = cronJobs();

crons.interval("drain automation outbox", { minutes: 1 }, internal.automation.drainOutbox, {});

export default crons;
