import { Module } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { SchedulerProcessor } from './scheduler.processor';
import { MisfireService } from './misfire.service';
import { PrismaScheduledTaskRepository } from '../infrastructure/persistence/prisma-scheduled-task.repository';
import { PrismaTaskExecutionRepository } from '../infrastructure/persistence/prisma-task-execution.repository';
import { BullJobScheduler } from '../infrastructure/scheduling/bull-job-scheduler';
import { RabbitMQMessageBus } from '../infrastructure/messaging/rabbitmq-message-bus';
import { FireTaskUseCase } from '../application/use-cases/fire-task.use-case';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
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
  providers: [
    MisfireService,
    { provide: 'IScheduledTaskRepository', useFactory: (p: PrismaService) => new PrismaScheduledTaskRepository(p), inject: [PrismaService] },
    { provide: 'ITaskExecutionRepository', useFactory: (p: PrismaService) => new PrismaTaskExecutionRepository(p), inject: [PrismaService] },
    { provide: 'IJobScheduler', useFactory: (q: Queue) => new BullJobScheduler(q), inject: [getQueueToken(BULL_QUEUE_NAME)] },
    { provide: 'IMessageBus', useFactory: (r: RabbitMQService) => new RabbitMQMessageBus(r), inject: [RabbitMQService] },
    {
      provide: FireTaskUseCase,
      useFactory: (taskRepo: PrismaScheduledTaskRepository, execRepo: PrismaTaskExecutionRepository, bus: RabbitMQMessageBus, misfire: MisfireService) =>
        new FireTaskUseCase(taskRepo, execRepo, bus, misfire),
      inject: ['IScheduledTaskRepository', 'ITaskExecutionRepository', 'IMessageBus', MisfireService],
    },
    { provide: SchedulerProcessor, useFactory: (useCase: FireTaskUseCase) => new SchedulerProcessor(useCase), inject: [FireTaskUseCase] },
  ],
  exports: [BullModule, 'IScheduledTaskRepository', 'ITaskExecutionRepository', 'IJobScheduler', 'IMessageBus'],
})
export class SchedulerModule {}
