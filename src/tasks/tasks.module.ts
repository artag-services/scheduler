import { Module } from '@nestjs/common';

import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SchedulerConsumer } from '../rabbitmq/scheduler.consumer';

@Module({
  imports: [SchedulerModule],
  controllers: [TasksController],
  providers: [TasksService, SchedulerConsumer],
  exports: [TasksService],
})
export class TasksModule {}
