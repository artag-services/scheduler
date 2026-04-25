import { Module } from '@nestjs/common';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

import { SchedulerModule } from '../scheduler/scheduler.module';
import { BULL_QUEUE_NAME } from '../rabbitmq/constants/queues';

/**
 * Mounts Bull Board UI at /admin/queues for live observability of the
 * scheduler queue (jobs in flight, completed, failed, retries, schedulers).
 *
 * No auth yet — restrict at the reverse proxy or add a NestJS guard later.
 */
@Module({
  imports: [
    SchedulerModule,
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature({
      name: BULL_QUEUE_NAME,
      adapter: BullMQAdapter,
    }),
  ],
})
export class AdminModule {}
