import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { FireTaskUseCase } from '../application/use-cases/fire-task.use-case';
import { BULL_QUEUE_NAME } from '../rabbitmq/constants/queues';

interface FireJobData {
  taskId: string;
}

@Processor(BULL_QUEUE_NAME)
export class SchedulerProcessor extends WorkerHost {
  constructor(private readonly fireTask: FireTaskUseCase) {
    super();
  }

  async process(job: Job<FireJobData>): Promise<void> {
    return this.fireTask.execute(job.data.taskId, new Date(job.timestamp));
  }
}
