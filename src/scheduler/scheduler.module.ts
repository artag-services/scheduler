import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { SchedulerProcessor } from './scheduler.processor';
import { MisfireService } from './misfire.service';
import { BULL_QUEUE_NAME } from '../rabbitmq/constants/queues';

@Module({
  imports: [
    BullModule.registerQueue({
      name: BULL_QUEUE_NAME,
      defaultJobOptions: {
        removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    }),
  ],
  providers: [SchedulerProcessor, MisfireService],
  exports: [BullModule],
})
export class SchedulerModule {}
