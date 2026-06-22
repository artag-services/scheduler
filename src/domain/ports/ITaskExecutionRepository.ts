export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED_LATE'

export interface TaskExecutionRecord {
  id: string
  taskId: string
  scheduledFor: Date
  firedAt: Date
  latencyMs: number
  status: ExecutionStatus
  error: string | null
  publishedTo: string
  idempotencyKey: string
}

export interface CreateExecutionData {
  taskId: string
  scheduledFor: Date
  firedAt: Date
  latencyMs: number
  status: ExecutionStatus
  publishedTo: string
  idempotencyKey: string
  error?: string
}

export interface ITaskExecutionRepository {
  create(data: CreateExecutionData): Promise<TaskExecutionRecord>
  findByTaskId(taskId: string, limit?: number): Promise<TaskExecutionRecord[]>
}
