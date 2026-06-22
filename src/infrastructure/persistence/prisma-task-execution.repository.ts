import { Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  ITaskExecutionRepository,
  TaskExecutionRecord,
  CreateExecutionData,
} from '../../domain/ports/ITaskExecutionRepository'

export class PrismaTaskExecutionRepository implements ITaskExecutionRepository {
  private readonly logger = new Logger(PrismaTaskExecutionRepository.name)

  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateExecutionData): Promise<TaskExecutionRecord> {
    try {
      const row = await this.prisma.taskExecution.create({ data })
      return this.toRecord(row)
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        this.logger.warn(`Duplicate fire detected for ${data.idempotencyKey} — already recorded`)
        return {
          id: '',
          taskId: data.taskId,
          scheduledFor: data.scheduledFor,
          firedAt: data.firedAt,
          latencyMs: data.latencyMs,
          status: data.status,
          error: data.error ?? null,
          publishedTo: data.publishedTo,
          idempotencyKey: data.idempotencyKey,
        }
      }
      throw err
    }
  }

  async findByTaskId(taskId: string, limit = 50): Promise<TaskExecutionRecord[]> {
    const rows = await this.prisma.taskExecution.findMany({
      where: { taskId },
      orderBy: { firedAt: 'desc' },
      take: limit,
    })
    return rows.map((r) => this.toRecord(r))
  }

  private toRecord(row: any): TaskExecutionRecord {
    return {
      id: row.id,
      taskId: row.taskId,
      scheduledFor: row.scheduledFor,
      firedAt: row.firedAt,
      latencyMs: row.latencyMs,
      status: row.status as TaskExecutionRecord['status'],
      error: row.error ?? null,
      publishedTo: row.publishedTo,
      idempotencyKey: row.idempotencyKey,
    }
  }
}
