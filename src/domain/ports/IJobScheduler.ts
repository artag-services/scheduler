import { ScheduledTaskRecord } from './IScheduledTaskRepository'

export interface IJobScheduler {
  register(task: ScheduledTaskRecord): Promise<void>
  unregister(task: ScheduledTaskRecord): Promise<void>
  triggerNow(taskId: string): Promise<void>
}
