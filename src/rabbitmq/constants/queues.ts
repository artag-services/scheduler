/**
 * RabbitMQ contracts for the Scheduler microservice.
 *
 * Exchange: topic `channels` (shared across all services).
 * The scheduler is *agnostic*: when a task fires, it publishes the task's
 * payload to whatever `targetRoutingKey` the task declared. Other services
 * consume on their existing queues — no changes required there.
 */

export const RABBITMQ_EXCHANGE = process.env.RABBITMQ_EXCHANGE ?? 'channels';

export const ROUTING_KEYS = {
  // Inbound: gateway → scheduler (write operations)
  CREATE: 'channels.scheduler.create',
  UPDATE: 'channels.scheduler.update',
  DELETE: 'channels.scheduler.delete',
  TRIGGER_NOW: 'channels.scheduler.trigger-now',

  // Outbound: scheduler → world (broadcast events)
  TASK_FIRED: 'channels.scheduler.task-fired',
} as const;

export const QUEUES = {
  CREATE: 'scheduler.create',
  UPDATE: 'scheduler.update',
  DELETE: 'scheduler.delete',
  TRIGGER_NOW: 'scheduler.trigger',
} as const;

export const BULL_QUEUE_NAME = 'scheduler';
