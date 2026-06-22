import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
  IScheduledTaskRepository,
  ScheduledTaskRecord,
  CreateTaskData,
  UpdateTaskData,
} from '../../domain/ports/IScheduledTaskRepository'

export class PrismaScheduledTaskRepository implements IScheduledTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ScheduledTaskRecord | null> {
    const row = await this.prisma.scheduledTask.findUnique({ where: { id } })
    return row ? this.toRecord(row) : null
  }

  async findAll(): Promise<ScheduledTaskRecord[]> {
    const rows = await this.prisma.scheduledTask.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map((r) => this.toRecord(r))
  }

  async create(data: CreateTaskData): Promise<ScheduledTaskRecord> {
    const row = await this.prisma.scheduledTask.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        scheduleType: data.scheduleType as any,
        cronExpression: data.cronExpression ?? null,
        intervalMs: data.intervalMs ?? null,
        runAt: data.runAt ?? null,
        timezone: data.timezone ?? 'America/Bogota',
        targetExchange: data.targetExchange ?? 'channels',
        targetRoutingKey: data.targetRoutingKey,
        payload: data.payload as unknown as Prisma.InputJsonValue,
        maxRetries: data.maxRetries ?? 3,
        retryBackoffMs: data.retryBackoffMs ?? 60000,
        maxLatenessMs: data.maxLatenessMs ?? 300000,
        createdBy: data.createdBy ?? null,
        nextFireAt: data.nextFireAt ?? null,
      },
    })
    return this.toRecord(row)
  }

  async update(id: string, data: UpdateTaskData): Promise<ScheduledTaskRecord> {
    const row = await this.prisma.scheduledTask.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        scheduleType: data.scheduleType as any,
        cronExpression: data.cronExpression,
        intervalMs: data.intervalMs,
        runAt: data.runAt,
        timezone: data.timezone,
        targetExchange: data.targetExchange,
        targetRoutingKey: data.targetRoutingKey,
        payload: data.payload as unknown as Prisma.InputJsonValue | undefined,
        status: data.status as any,
        maxRetries: data.maxRetries,
        retryBackoffMs: data.retryBackoffMs,
        maxLatenessMs: data.maxLatenessMs,
        nextFireAt: data.nextFireAt,
      },
    })
    return this.toRecord(row)
  }

  async delete(id: string): Promise<void> {
    await this.prisma.scheduledTask.delete({ where: { id } })
  }

  async updateStats(id: string, success: boolean, status: string, firedAt: Date): Promise<void> {
    await this.prisma.scheduledTask.update({
      where: { id },
      data: {
        fireCount: { increment: 1 },
        failureCount: success ? undefined : { increment: 1 },
        lastFiredAt: firedAt,
        lastStatus: status,
      },
    })
  }

  private toRecord(row: any): ScheduledTaskRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      scheduleType: row.scheduleType as ScheduledTaskRecord['scheduleType'],
      cronExpression: row.cronExpression ?? null,
      intervalMs: row.intervalMs ?? null,
      runAt: row.runAt ?? null,
      timezone: row.timezone,
      targetExchange: row.targetExchange,
      targetRoutingKey: row.targetRoutingKey,
      payload: row.payload as Record<string, unknown>,
      status: row.status as ScheduledTaskRecord['status'],
      maxRetries: row.maxRetries,
      retryBackoffMs: row.retryBackoffMs,
      maxLatenessMs: row.maxLatenessMs,
      fireCount: row.fireCount,
      failureCount: row.failureCount,
      lastFiredAt: row.lastFiredAt ?? null,
      lastStatus: row.lastStatus ?? null,
      nextFireAt: row.nextFireAt ?? null,
      createdBy: row.createdBy ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
