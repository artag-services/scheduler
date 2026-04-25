import { Injectable, Logger } from '@nestjs/common';

/**
 * Decides whether a fire should be executed late or skipped.
 *
 * Catch-up-with-grace policy:
 *  - if latencyMs <= maxLatenessMs → fire late (catch-up)
 *  - if latencyMs >  maxLatenessMs → skip (too late, would surprise users)
 *
 * Burst protection: even if many fires were missed, BullMQ's job scheduler
 * only enqueues the *next* iteration when a fire happens, so there is no
 * thundering herd. This service handles the per-fire decision.
 */
@Injectable()
export class MisfireService {
  private readonly logger = new Logger(MisfireService.name);

  shouldSkip(latencyMs: number, maxLatenessMs: number): boolean {
    const skip = latencyMs > maxLatenessMs;
    if (skip) {
      this.logger.warn(
        `Skipping fire — latency ${latencyMs}ms exceeded maxLatenessMs ${maxLatenessMs}ms`,
      );
    }
    return skip;
  }
}
