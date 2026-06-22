import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { RabbitMQService } from './rabbitmq.service';
import { IMessageBus } from '../domain/ports/IMessageBus';
import { QUEUES, ROUTING_KEYS } from './constants/queues';
import { TasksService } from '../tasks/tasks.service';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../tasks/dto/update-task.dto';

interface RpcEnvelope {
  correlationId?: string;
  [k: string]: unknown;
}

@Injectable()
export class SchedulerConsumer implements OnModuleInit {
  private readonly logger = new Logger(SchedulerConsumer.name);

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly tasks: TasksService,
    private readonly bus: IMessageBus,
  ) {}

  async onModuleInit() {
    await this.rabbitmq.subscribe(QUEUES.CREATE, ROUTING_KEYS.CREATE, (p) => this.handle(p, 'create'));
    await this.rabbitmq.subscribe(QUEUES.UPDATE, ROUTING_KEYS.UPDATE, (p) => this.handle(p, 'update'));
    await this.rabbitmq.subscribe(QUEUES.DELETE, ROUTING_KEYS.DELETE, (p) => this.handle(p, 'delete'));
    await this.rabbitmq.subscribe(QUEUES.PAUSE, ROUTING_KEYS.PAUSE, (p) => this.handle(p, 'pause'));
    await this.rabbitmq.subscribe(QUEUES.RESUME, ROUTING_KEYS.RESUME, (p) => this.handle(p, 'resume'));
    await this.rabbitmq.subscribe(QUEUES.TRIGGER_NOW, ROUTING_KEYS.TRIGGER_NOW, (p) => this.handle(p, 'trigger'));
    await this.rabbitmq.subscribe(QUEUES.LIST, ROUTING_KEYS.LIST, (p) => this.handle(p, 'list'));
    await this.rabbitmq.subscribe(QUEUES.GET, ROUTING_KEYS.GET, (p) => this.handle(p, 'get'));
    await this.rabbitmq.subscribe(QUEUES.RUNS, ROUTING_KEYS.RUNS, (p) => this.handle(p, 'runs'));
  }

  private async handle(payload: Record<string, unknown>, op: string): Promise<void> {
    const env = payload as RpcEnvelope;
    const correlationId = env.correlationId;
    this.logger.log(`[${op}] correlationId=${correlationId ?? 'none'}`);

    try {
      const data = await this.dispatch(op, env);
      if (correlationId) this.respond(correlationId, true, data);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`[${op}] failed: ${message}`);
      if (correlationId) this.respond(correlationId, false, { error: message });
    }
  }

  private async dispatch(op: string, env: RpcEnvelope): Promise<unknown> {
    switch (op) {
      case 'create': {
        const { correlationId: _c, ...dto } = env;
        return this.tasks.create(dto as unknown as CreateTaskDto);
      }
      case 'update': {
        const { correlationId: _c, id, ...rest } = env as { id: string } & RpcEnvelope;
        if (!id) throw new Error('id is required for update');
        return this.tasks.update(id, rest as unknown as UpdateTaskDto);
      }
      case 'delete': {
        const { id } = env as { id: string };
        if (!id) throw new Error('id is required for delete');
        await this.tasks.remove(id);
        return { id, deleted: true };
      }
      case 'pause': {
        const { id } = env as { id: string };
        if (!id) throw new Error('id is required for pause');
        return this.tasks.pause(id);
      }
      case 'resume': {
        const { id } = env as { id: string };
        if (!id) throw new Error('id is required for resume');
        return this.tasks.resume(id);
      }
      case 'trigger': {
        const { id } = env as { id: string };
        if (!id) throw new Error('id is required for trigger');
        await this.tasks.triggerNow(id);
        return { id, triggered: true };
      }
      case 'list':
        return { tasks: await this.tasks.list() };
      case 'get': {
        const { id } = env as { id: string };
        if (!id) throw new Error('id is required for get');
        return { task: await this.tasks.get(id) };
      }
      case 'runs': {
        const { id, limit } = env as { id: string; limit?: number };
        if (!id) throw new Error('id is required for runs');
        return { runs: await this.tasks.listExecutions(id, limit ?? 50) };
      }
      default:
        throw new Error(`Unknown op: ${op}`);
    }
  }

  private respond(correlationId: string, success: boolean, data: unknown): void {
    this.bus.publish(ROUTING_KEYS.RESPONSE, {
      correlationId,
      success,
      ...(typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : { data }),
    });
  }
}
