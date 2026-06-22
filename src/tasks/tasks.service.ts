import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ScheduleType, ScheduledTask, TaskStatus } from '@prisma/client';
import * as cronParser from 'cron-parser';

import { IScheduledTaskRepository, ScheduledTaskRecord } from '../domain/ports/IScheduledTaskRepository';
import { ITaskExecutionRepository } from '../domain/ports/ITaskExecutionRepository';
import { IJobScheduler } from '../domain/ports/IJobScheduler';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly taskRepo: IScheduledTaskRepository,
    private readonly executionRepo: ITaskExecutionRepository,
    private readonly jobScheduler: IJobScheduler,
  ) {}

  list(): Promise<ScheduledTaskRecord[]> {
    return this.taskRepo.findAll();
  }

  async get(id: string): Promise<ScheduledTaskRecord> {
    const task = await this.taskRepo.findById(id);
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  listExecutions(taskId: string, limit = 50) {
    return this.executionRepo.findByTaskId(taskId, limit);
  }

  async create(dto: CreateTaskDto): Promise<ScheduledTaskRecord> {
    this.validateSchedule(dto.scheduleType, dto.cronExpression, dto.intervalMs, dto.runAt);

    const nextFireAt = this.computeNextFireAt(
      dto.scheduleType,
      dto.cronExpression,
      dto.intervalMs,
      dto.runAt,
      dto.timezone,
    );

    const task = await this.taskRepo.create({
      name: dto.name,
      description: dto.description,
      scheduleType: dto.scheduleType as ScheduledTaskRecord['scheduleType'],
      cronExpression: dto.cronExpression,
      intervalMs: dto.intervalMs,
      runAt: dto.runAt ? new Date(dto.runAt) : null,
      timezone: dto.timezone,
      targetExchange: dto.targetExchange,
      targetRoutingKey: dto.targetRoutingKey,
      payload: dto.payload as Record<string, unknown>,
      maxRetries: dto.maxRetries,
      retryBackoffMs: dto.retryBackoffMs,
      maxLatenessMs: dto.maxLatenessMs,
      createdBy: dto.createdBy,
      nextFireAt,
    });

    await this.jobScheduler.register(task);
    this.logger.log(`Created task ${task.id} (${task.name}) → ${task.targetRoutingKey}`);
    return task;
  }

  async update(id: string, dto: UpdateTaskDto): Promise<ScheduledTaskRecord> {
    const existing = await this.get(id);

    const mergedScheduleType = dto.scheduleType ?? existing.scheduleType;
    const mergedCron = dto.cronExpression ?? existing.cronExpression ?? undefined;
    const mergedInterval = dto.intervalMs ?? existing.intervalMs ?? undefined;
    const mergedRunAt = dto.runAt ?? (existing.runAt ? existing.runAt.toISOString() : undefined);
    const mergedTimezone = dto.timezone ?? existing.timezone;

    if (dto.scheduleType || dto.cronExpression || dto.intervalMs || dto.runAt || dto.timezone) {
      this.validateSchedule(mergedScheduleType as ScheduleType, mergedCron, mergedInterval, mergedRunAt);
    }

    const nextFireAt = this.computeNextFireAt(
      mergedScheduleType as ScheduleType,
      mergedCron,
      mergedInterval,
      mergedRunAt,
      mergedTimezone,
    );

    const task = await this.taskRepo.update(id, {
      name: dto.name,
      description: dto.description,
      scheduleType: dto.scheduleType as ScheduledTaskRecord['scheduleType'] | undefined,
      cronExpression: dto.cronExpression,
      intervalMs: dto.intervalMs,
      runAt: dto.runAt ? new Date(dto.runAt) : undefined,
      timezone: dto.timezone,
      targetExchange: dto.targetExchange,
      targetRoutingKey: dto.targetRoutingKey,
      payload: dto.payload as Record<string, unknown> | undefined,
      status: dto.status as ScheduledTaskRecord['status'] | undefined,
      maxRetries: dto.maxRetries,
      retryBackoffMs: dto.retryBackoffMs,
      maxLatenessMs: dto.maxLatenessMs,
      nextFireAt,
    });

    await this.jobScheduler.unregister(existing);
    if (task.status === 'ACTIVE') {
      await this.jobScheduler.register(task);
    }

    return task;
  }

  async pause(id: string): Promise<ScheduledTaskRecord> {
    const task = await this.get(id);
    await this.jobScheduler.unregister(task);
    return this.taskRepo.update(id, { status: 'PAUSED' });
  }

  async resume(id: string): Promise<ScheduledTaskRecord> {
    const task = await this.get(id);
    const updated = await this.taskRepo.update(id, { status: 'ACTIVE' });
    await this.jobScheduler.register(updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const task = await this.get(id);
    await this.jobScheduler.unregister(task);
    await this.taskRepo.delete(id);
    this.logger.log(`Deleted task ${id}`);
  }

  async triggerNow(id: string): Promise<void> {
    const task = await this.get(id);
    await this.jobScheduler.triggerNow(task.id);
    this.logger.log(`Manually triggered task ${id}`);
  }

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
