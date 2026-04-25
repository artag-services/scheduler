import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, RepeatOptions } from 'bullmq';
import { Prisma, ScheduleType, ScheduledTask, TaskStatus } from '@prisma/client';
import * as cronParser from 'cron-parser';

import { PrismaService } from '../prisma/prisma.service';
import { BULL_QUEUE_NAME } from '../rabbitmq/constants/queues';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const FIRE_JOB_NAME = 'fire-task';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(BULL_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  // ─────────────────────────────────────────────────────
  // Reads
  // ─────────────────────────────────────────────────────
  list() {
    return this.prisma.scheduledTask.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async get(id: string): Promise<ScheduledTask> {
    const task = await this.prisma.scheduledTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  listExecutions(taskId: string, limit = 50) {
    return this.prisma.taskExecution.findMany({
      where: { taskId },
      orderBy: { firedAt: 'desc' },
      take: limit,
    });
  }

  // ─────────────────────────────────────────────────────
  // Writes
  // ─────────────────────────────────────────────────────
  async create(dto: CreateTaskDto): Promise<ScheduledTask> {
    this.validateSchedule(dto.scheduleType, dto.cronExpression, dto.intervalMs, dto.runAt);

    const nextFireAt = this.computeNextFireAt(
      dto.scheduleType,
      dto.cronExpression,
      dto.intervalMs,
      dto.runAt,
      dto.timezone,
    );

    const task = await this.prisma.scheduledTask.create({
      data: {
        name: dto.name,
        description: dto.description,
        scheduleType: dto.scheduleType,
        cronExpression: dto.cronExpression,
        intervalMs: dto.intervalMs,
        runAt: dto.runAt ? new Date(dto.runAt) : undefined,
        timezone: dto.timezone ?? 'America/Bogota',
        targetExchange: dto.targetExchange ?? 'channels',
        targetRoutingKey: dto.targetRoutingKey,
        payload: dto.payload as unknown as Prisma.InputJsonValue,
        maxRetries: dto.maxRetries,
        retryBackoffMs: dto.retryBackoffMs,
        maxLatenessMs: dto.maxLatenessMs,
        createdBy: dto.createdBy,
        nextFireAt,
      },
    });

    await this.registerInQueue(task);

    this.logger.log(`Created task ${task.id} (${task.name}) → ${task.targetRoutingKey}`);
    return task;
  }

  async update(id: string, dto: UpdateTaskDto): Promise<ScheduledTask> {
    const existing = await this.get(id);

    const merged: ScheduledTask = { ...existing, ...dto } as ScheduledTask;
    if (
      dto.scheduleType ||
      dto.cronExpression ||
      dto.intervalMs ||
      dto.runAt ||
      dto.timezone
    ) {
      this.validateSchedule(
        merged.scheduleType,
        merged.cronExpression ?? undefined,
        merged.intervalMs ?? undefined,
        merged.runAt ? merged.runAt.toISOString() : undefined,
      );
    }

    const nextFireAt = this.computeNextFireAt(
      merged.scheduleType,
      merged.cronExpression ?? undefined,
      merged.intervalMs ?? undefined,
      merged.runAt ? merged.runAt.toISOString() : undefined,
      merged.timezone,
    );

    const task = await this.prisma.scheduledTask.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        scheduleType: dto.scheduleType,
        cronExpression: dto.cronExpression,
        intervalMs: dto.intervalMs,
        runAt: dto.runAt ? new Date(dto.runAt) : undefined,
        timezone: dto.timezone,
        targetExchange: dto.targetExchange,
        targetRoutingKey: dto.targetRoutingKey,
        payload: dto.payload as unknown as Prisma.InputJsonValue | undefined,
        status: dto.status,
        maxRetries: dto.maxRetries,
        retryBackoffMs: dto.retryBackoffMs,
        maxLatenessMs: dto.maxLatenessMs,
        nextFireAt,
      },
    });

    // Re-register in BullMQ to reflect any schedule changes
    await this.unregisterFromQueue(existing);
    if (task.status === 'ACTIVE') {
      await this.registerInQueue(task);
    }

    return task;
  }

  async pause(id: string): Promise<ScheduledTask> {
    const task = await this.get(id);
    await this.unregisterFromQueue(task);
    return this.prisma.scheduledTask.update({
      where: { id },
      data: { status: TaskStatus.PAUSED },
    });
  }

  async resume(id: string): Promise<ScheduledTask> {
    const task = await this.get(id);
    const updated = await this.prisma.scheduledTask.update({
      where: { id },
      data: { status: TaskStatus.ACTIVE },
    });
    await this.registerInQueue(updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const task = await this.get(id);
    await this.unregisterFromQueue(task);
    await this.prisma.scheduledTask.delete({ where: { id } });
    this.logger.log(`Deleted task ${id}`);
  }

  /**
   * Force-fire a task right now, ignoring its schedule. Useful for testing or
   * manual replays. The fire still goes through the same processor, so it is
   * recorded as an execution like any other.
   */
  async triggerNow(id: string): Promise<void> {
    const task = await this.get(id);
    await this.queue.add(FIRE_JOB_NAME, { taskId: task.id });
    this.logger.log(`Manually triggered task ${id}`);
  }

  // ─────────────────────────────────────────────────────
  // BullMQ wiring
  // ─────────────────────────────────────────────────────
  private async registerInQueue(task: ScheduledTask): Promise<void> {
    if (task.status !== 'ACTIVE') return;

    if (task.scheduleType === ScheduleType.ONCE) {
      const runAt = task.runAt ?? new Date();
      const delay = Math.max(0, runAt.getTime() - Date.now());
      await this.queue.add(FIRE_JOB_NAME, { taskId: task.id }, { delay });
      return;
    }

    const repeat: RepeatOptions =
      task.scheduleType === ScheduleType.CRON
        ? { pattern: task.cronExpression!, tz: task.timezone }
        : { every: task.intervalMs! };

    const schedulerId = `task-${task.id}`;

    // Job Schedulers (BullMQ v5+) — replaces deprecated repeatable jobs
    await this.queue.upsertJobScheduler(schedulerId, repeat, {
      name: FIRE_JOB_NAME,
      data: { taskId: task.id },
    });

    // Persist scheduler ID so updates/deletes can find it later
    await this.prisma.scheduledTask.update({
      where: { id: task.id },
      data: { bullSchedulerId: schedulerId },
    });
  }

  private async unregisterFromQueue(task: ScheduledTask): Promise<void> {
    if (task.bullSchedulerId) {
      try {
        await this.queue.removeJobScheduler(task.bullSchedulerId);
      } catch (err) {
        this.logger.warn(`Failed to remove scheduler ${task.bullSchedulerId}: ${(err as Error).message}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────
  private validateSchedule(
    type: ScheduleType,
    cron?: string,
    intervalMs?: number,
    runAt?: string,
  ): void {
    if (type === ScheduleType.CRON) {
      if (!cron) throw new BadRequestException('cronExpression is required for CRON schedule');
      try {
        cronParser.parseExpression(cron);
      } catch (err) {
        throw new BadRequestException(`Invalid cron expression: ${(err as Error).message}`);
      }
    }
    if (type === ScheduleType.INTERVAL) {
      if (!intervalMs || intervalMs < 1000) {
        throw new BadRequestException('intervalMs must be >= 1000 for INTERVAL schedule');
      }
    }
    if (type === ScheduleType.ONCE) {
      if (!runAt) throw new BadRequestException('runAt is required for ONCE schedule');
      const ts = Date.parse(runAt);
      if (Number.isNaN(ts)) throw new BadRequestException('runAt must be a valid ISO datetime');
    }
  }

  private computeNextFireAt(
    type: ScheduleType,
    cron?: string,
    intervalMs?: number,
    runAt?: string,
    timezone?: string,
  ): Date | undefined {
    try {
      if (type === ScheduleType.CRON && cron) {
        return cronParser.parseExpression(cron, { tz: timezone }).next().toDate();
      }
      if (type === ScheduleType.INTERVAL && intervalMs) {
        return new Date(Date.now() + intervalMs);
      }
      if (type === ScheduleType.ONCE && runAt) {
        return new Date(runAt);
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
}
