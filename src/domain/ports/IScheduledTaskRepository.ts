export interface ScheduledTaskRecord {
  id: string
  name: string
  description: string | null
  scheduleType: 'CRON' | 'INTERVAL' | 'ONCE'
  cronExpression: string | null
  intervalMs: number | null
  runAt: Date | null
  timezone: string
  targetExchange: string
  targetRoutingKey: string
  payload: Record<string, unknown>
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'FAILED'
  maxRetries: number
  retryBackoffMs: number
  maxLatenessMs: number
  fireCount: number
  failureCount: number
  lastFiredAt: Date | null
  lastStatus: string | null
  nextFireAt: Date | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateTaskData {
  name: string
  description?: string | null
  scheduleType: 'CRON' | 'INTERVAL' | 'ONCE'
  cronExpression?: string | null
  intervalMs?: number | null
  runAt?: Date | null
  timezone?: string
  targetExchange?: string
  targetRoutingKey: string
  payload: Record<string, unknown>
  maxRetries?: number
  retryBackoffMs?: number
  maxLatenessMs?: number
  createdBy?: string | null
  nextFireAt?: Date | null
}

export interface UpdateTaskData {
  name?: string
  description?: string | null
  scheduleType?: 'CRON' | 'INTERVAL' | 'ONCE'
  cronExpression?: string | null
  intervalMs?: number | null
  runAt?: Date | null
  timezone?: string
  targetExchange?: string
  targetRoutingKey?: string
  payload?: Record<string, unknown>
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'FAILED'
  maxRetries?: number
  retryBackoffMs?: number
  maxLatenessMs?: number
  nextFireAt?: Date | null
}

export interface IScheduledTaskRepository {
  findById(id: string): Promise<ScheduledTaskRecord | null>
  findAll(): Promise<ScheduledTaskRecord[]>
  create(data: CreateTaskData): Promise<ScheduledTaskRecord>
  update(id: string, data: UpdateTaskData): Promise<ScheduledTaskRecord>
  delete(id: string): Promise<void>
  updateStats(id: string, success: boolean, status: string, firedAt: Date): Promise<void>
}
