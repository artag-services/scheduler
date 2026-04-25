/**
 * RabbitMQ contracts for the Scheduler microservice.
 *
 * Exchange: topic `channels` (shared across all services).
 *
 * The scheduler is *agnostic*: when a task fires, it publishes the task's
 * payload to whatever `targetRoutingKey` the task declared. Other services
 * consume on their existing queues — no changes required there.
 *
 * RPC pattern (request-response over RabbitMQ): write & read endpoints carry
 * a `correlationId`. The scheduler echoes it back on `SCHEDULER_RESPONSE` so
 * the gateway can resolve the awaiting promise. NO direct HTTP between
 * gateway and scheduler — everything goes through this exchange.
 */

export const RABBITMQ_EXCHANGE = process.env.RABBITMQ_EXCHANGE ?? 'channels';

export const ROUTING_KEYS = {
  // Inbound: gateway → scheduler
  CREATE: 'channels.scheduler.create',
  UPDATE: 'channels.scheduler.update',
  DELETE: 'channels.scheduler.delete',
  PAUSE: 'channels.scheduler.pause',
  RESUME: 'channels.scheduler.resume',
  TRIGGER_NOW: 'channels.scheduler.trigger-now',
  LIST: 'channels.scheduler.list',
  GET: 'channels.scheduler.get',
  RUNS: 'channels.scheduler.runs',

  // Outbound: scheduler → gateway (RPC responses, all via the same routing key,
  // distinguished by correlationId in the payload)
  RESPONSE: 'channels.scheduler.response',

  // Outbound: scheduler → world (broadcast event when a task fires)
  TASK_FIRED: 'channels.scheduler.task-fired',
} as const;

export const QUEUES = {
  CREATE: 'scheduler.create',
  UPDATE: 'scheduler.update',
  DELETE: 'scheduler.delete',
  PAUSE: 'scheduler.pause',
  RESUME: 'scheduler.resume',
  TRIGGER_NOW: 'scheduler.trigger',
  LIST: 'scheduler.list',
  GET: 'scheduler.get',
  RUNS: 'scheduler.runs',
} as const;

export const BULL_QUEUE_NAME = 'scheduler';
