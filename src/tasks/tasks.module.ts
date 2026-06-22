import { Module } from '@nestjs/common';

import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SchedulerConsumer } from '../rabbitmq/scheduler.consumer';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

@Module({
  imports: [SchedulerModule],
  controllers: [TasksController],
  providers: [
    {
      provide: TasksService,
      useFactory: (taskRepo: any, execRepo: any, jobScheduler: any) =>
        new TasksService(taskRepo, execRepo, jobScheduler),
      inject: ['IScheduledTaskRepository', 'ITaskExecutionRepository', 'IJobScheduler'],
    },
    {
      provide: SchedulerConsumer,
      useFactory: (rabbitmq: RabbitMQService, tasks: TasksService, bus: any) =>
        new SchedulerConsumer(rabbitmq, tasks, bus),
      inject: [RabbitMQService, TasksService, 'IMessageBus'],
    },
  ],
  exports: [TasksService],
})
export class TasksModule {}
