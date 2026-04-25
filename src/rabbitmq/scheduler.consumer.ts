import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { RabbitMQService } from './rabbitmq.service';
import { QUEUES, ROUTING_KEYS } from './constants/queues';
import { TasksService } from '../tasks/tasks.service';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../tasks/dto/update-task.dto';

/**
 * Bridges RabbitMQ messages from the gateway (or any other publisher) into
 * the TasksService. The HTTP controller is the same surface — both routes
 * lead to the same service methods.
 */
@Injectable()
export class SchedulerConsumer implements OnModuleInit {
  private readonly logger = new Logger(SchedulerConsumer.name);

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly tasks: TasksService,
  ) {}

  async onModuleInit() {
    await this.rabbitmq.subscribe(QUEUES.CREATE, ROUTING_KEYS.CREATE, (p) =>
      this.handleCreate(p),
    );
    await this.rabbitmq.subscribe(QUEUES.UPDATE, ROUTING_KEYS.UPDATE, (p) =>
      this.handleUpdate(p),
    );
    await this.rabbitmq.subscribe(QUEUES.DELETE, ROUTING_KEYS.DELETE, (p) =>
      this.handleDelete(p),
    );
    await this.rabbitmq.subscribe(QUEUES.TRIGGER_NOW, ROUTING_KEYS.TRIGGER_NOW, (p) =>
      this.handleTrigger(p),
    );
  }

  private async handleCreate(payload: Record<string, unknown>): Promise<void> {
    const dto = payload as unknown as CreateTaskDto;
    this.logger.log(`[create] name=${dto.name} target=${dto.targetRoutingKey}`);
    await this.tasks.create(dto);
  }

  private async handleUpdate(payload: Record<string, unknown>): Promise<void> {
    const { id, ...rest } = payload as { id: string } & Record<string, unknown>;
    if (!id) {
      this.logger.warn('[update] missing id in payload');
      return;
    }
    this.logger.log(`[update] id=${id}`);
    await this.tasks.update(id, rest as unknown as UpdateTaskDto);
  }

  private async handleDelete(payload: Record<string, unknown>): Promise<void> {
    const { id } = payload as { id: string };
    if (!id) {
      this.logger.warn('[delete] missing id in payload');
      return;
    }
    this.logger.log(`[delete] id=${id}`);
    await this.tasks.remove(id);
  }

  private async handleTrigger(payload: Record<string, unknown>): Promise<void> {
    const { id } = payload as { id: string };
    if (!id) {
      this.logger.warn('[trigger] missing id in payload');
      return;
    }
    this.logger.log(`[trigger] id=${id}`);
    await this.tasks.triggerNow(id);
  }
}
