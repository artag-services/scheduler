import { IScheduledTaskRepository } from '../../domain/ports/IScheduledTaskRepository'
import { ITaskExecutionRepository } from '../../domain/ports/ITaskExecutionRepository'
import { IMessageBus } from '../../domain/ports/IMessageBus'
import { MisfireService } from '../../scheduler/misfire.service'
import { ROUTING_KEYS } from '../../rabbitmq/constants/queues'

export class FireTaskUseCase {
  constructor(
    private readonly taskRepo: IScheduledTaskRepository,
    private readonly executionRepo: ITaskExecutionRepository,
    private readonly bus: IMessageBus,
    private readonly misfire: MisfireService,
  ) {}

  async execute(taskId: string, scheduledFor: Date): Promise<void> {
    const firedAt = new Date()
    const latencyMs = firedAt.getTime() - scheduledFor.getTime()
    const idempotencyKey = `${taskId}-${scheduledFor.toISOString()}`

    const task = await this.taskRepo.findById(taskId)
    if (!task) return
    if (task.status !== 'ACTIVE') return

    if (this.misfire.shouldSkip(latencyMs, task.maxLatenessMs)) {
      await this.executionRepo.create({
        taskId,
        scheduledFor,
        firedAt,
        latencyMs,
        status: 'SKIPPED_LATE',
        publishedTo: '',
        idempotencyKey,
        error: `latency ${latencyMs}ms > maxLatenessMs ${task.maxLatenessMs}ms`,
      })
      await this.taskRepo.updateStats(taskId, false, 'SKIPPED_LATE', firedAt)
      return
    }

    const outboundPayload: Record<string, unknown> = {
      ...task.payload,
      idempotencyKey,
      _scheduler: {
        taskId,
        executionId: idempotencyKey,
        scheduledFor: scheduledFor.toISOString(),
        firedAt: firedAt.toISOString(),
        latencyMs,
      },
    }

    try {
      this.bus.publish(task.targetRoutingKey, outboundPayload, task.targetExchange)

      await this.executionRepo.create({
        taskId,
        scheduledFor,
        firedAt,
        latencyMs,
        status: 'SUCCESS',
        publishedTo: task.targetRoutingKey,
        idempotencyKey,
      })
      await this.taskRepo.updateStats(taskId, true, 'SUCCESS', firedAt)

      this.bus.publish(ROUTING_KEYS.TASK_FIRED, {
        taskId,
        executionId: idempotencyKey,
        status: 'SUCCESS',
        firedAt: firedAt.toISOString(),
        publishedTo: task.targetRoutingKey,
      })

      if (task.scheduleType === 'ONCE') {
        await this.taskRepo.update(taskId, { status: 'COMPLETED' })
      }
    } catch (err) {
      const error = (err as Error).message
      await this.executionRepo.create({
        taskId,
        scheduledFor,
        firedAt,
        latencyMs,
        status: 'FAILED',
        publishedTo: task.targetRoutingKey,
        idempotencyKey,
        error,
      })
      await this.taskRepo.updateStats(taskId, false, 'FAILED', firedAt)
      throw err
    }
  }
}
