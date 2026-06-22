import { Logger } from '@nestjs/common'
import { Queue, RepeatOptions } from 'bullmq'

import { IJobScheduler } from '../../domain/ports/IJobScheduler'
import { ScheduledTaskRecord } from '../../domain/ports/IScheduledTaskRepository'

const FIRE_JOB_NAME = 'fire-task'

export class BullJobScheduler implements IJobScheduler {
  private readonly logger = new Logger(BullJobScheduler.name)

  constructor(private readonly queue: Queue) {}

  async register(task: ScheduledTaskRecord): Promise<void> {
    const schedulerId = `task-${task.id}`

    if (task.scheduleType === 'ONCE') {
      const runAt = task.runAt ?? new Date()
      const delay = Math.max(0, runAt.getTime() - Date.now())
      await this.queue.add(FIRE_JOB_NAME, { taskId: task.id }, { delay })
      return
    }

    const repeat: RepeatOptions =
      task.scheduleType === 'CRON'
        ? { pattern: task.cronExpression!, tz: task.timezone }
        : { every: task.intervalMs! }

    await this.queue.upsertJobScheduler(schedulerId, repeat, {
      name: FIRE_JOB_NAME,
      data: { taskId: task.id },
    })
  }

  async unregister(task: ScheduledTaskRecord): Promise<void> {
    const schedulerId = `task-${task.id}`
    try {
      await this.queue.removeJobScheduler(schedulerId)
    } catch (err) {
      this.logger.warn(`Failed to remove scheduler ${schedulerId}: ${(err as Error).message}`)
    }
  }

  async triggerNow(taskId: string): Promise<void> {
    await this.queue.add(FIRE_JOB_NAME, { taskId })
  }
}
