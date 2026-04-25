import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { MisfireService } from './misfire.service';
import { BULL_QUEUE_NAME, ROUTING_KEYS } from '../rabbitmq/constants/queues';

interface FireJobData {
  taskId: string;
}

/**
 * The single processor for ALL scheduled-task fires.
 *
 * It is intentionally agnostic: it loads the task, decides whether to fire
 * (misfire policy), and publishes the task's stored `payload` to the task's
 * stored `targetRoutingKey`. It knows nothing about WhatsApp, Notion, etc.
 *
 * Every fire is logged in `TaskExecution` with a deterministic
 * `idempotencyKey` so duplicate fires (e.g. on worker crash + retry) are
 * detected by the unique constraint on that column.
 */
@Processor(BULL_QUEUE_NAME)
export class SchedulerProcessor extends WorkerHost {
  private readonly logger = new Logger(SchedulerProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMQService,
    private readonly misfire: MisfireService,
  ) {
    super();
  }

  async process(job: Job<FireJobData>): Promise<void> {
    const { taskId } = job.data;
    const scheduledFor = new Date(job.timestamp);
    const firedAt = new Date();
    const latencyMs = firedAt.getTime() - scheduledFor.getTime();
    const idempotencyKey = `${taskId}-${scheduledFor.toISOString()}`;

    const task = await this.prisma.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) {
      this.logger.warn(`Task ${taskId} not found — likely deleted, dropping fire`);
      return;
    }
    if (task.status !== 'ACTIVE') {
      this.logger.warn(`Task ${taskId} status=${task.status} — skipping fire`);
      return;
    }

    // Misfire guard
    if (this.misfire.shouldSkip(latencyMs, task.maxLatenessMs)) {
      await this.safeRecord({
        taskId,
        scheduledFor,
        firedAt,
        latencyMs,
        status: 'SKIPPED_LATE',
        publishedTo: '',
        idempotencyKey,
        error: `latency ${latencyMs}ms > maxLatenessMs ${task.maxLatenessMs}ms`,
      });
      await this.updateStats(taskId, false, 'SKIPPED_LATE', firedAt);
      return;
    }

    // Build the outbound payload (preserve the task's payload, inject scheduler metadata)
    const outboundPayload = {
      ...(task.payload as Record<string, unknown>),
      idempotencyKey,
      _scheduler: {
        taskId,
        executionId: idempotencyKey,
        scheduledFor: scheduledFor.toISOString(),
        firedAt: firedAt.toISOString(),
        latencyMs,
      },
    };

    try {
      this.rabbitmq.publish(task.targetRoutingKey, outboundPayload, task.targetExchange);

      await this.safeRecord({
        taskId,
        scheduledFor,
        firedAt,
        latencyMs,
        status: 'SUCCESS',
        publishedTo: task.targetRoutingKey,
        idempotencyKey,
      });
      await this.updateStats(taskId, true, 'SUCCESS', firedAt);

      // Broadcast event so other systems (Bull Board, custom listeners) can react
      this.rabbitmq.publish(ROUTING_KEYS.TASK_FIRED, {
        taskId,
        executionId: idempotencyKey,
        status: 'SUCCESS',
        firedAt: firedAt.toISOString(),
        publishedTo: task.targetRoutingKey,
      });

      // ONCE tasks transition to COMPLETED after their single fire
      if (task.scheduleType === 'ONCE') {
        await this.prisma.scheduledTask.update({
          where: { id: taskId },
          data: { status: 'COMPLETED' },
        });
      }

      this.logger.log(
        `🔥 Fired task ${taskId} (${task.name}) → ${task.targetRoutingKey} | latency=${latencyMs}ms`,
      );
    } catch (err) {
      const error = (err as Error).message;
      await this.safeRecord({
        taskId,
        scheduledFor,
        firedAt,
        latencyMs,
        status: 'FAILED',
        publishedTo: task.targetRoutingKey,
        idempotencyKey,
        error,
      });
      await this.updateStats(taskId, false, 'FAILED', firedAt);
      throw err; // let BullMQ apply retry/backoff
    }
  }

  /**
   * Insert TaskExecution; if the unique idempotencyKey already exists, swallow
   * the error — that means we are reprocessing the same logical fire (worker
   * crash, retry, etc.) and the original record is the source of truth.
   */
  private async safeRecord(data: {
    taskId: string;
    scheduledFor: Date;
    firedAt: Date;
    latencyMs: number;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED_LATE';
    publishedTo: string;
    idempotencyKey: string;
    error?: string;
  }): Promise<void> {
    try {
      await this.prisma.taskExecution.create({ data });
    } catch (err) {
      // P2002 = unique constraint violation on idempotencyKey
      if ((err as { code?: string }).code === 'P2002') {
        this.logger.warn(
          `Duplicate fire detected for ${data.idempotencyKey} — already recorded`,
        );
        return;
      }
      throw err;
    }
  }

  private async updateStats(
    taskId: string,
    success: boolean,
    status: string,
    firedAt: Date,
  ): Promise<void> {
    await this.prisma.scheduledTask.update({
      where: { id: taskId },
      data: {
        fireCount: { increment: 1 },
        failureCount: success ? undefined : { increment: 1 },
        lastFiredAt: firedAt,
        lastStatus: status,
      },
    });
  }
}
