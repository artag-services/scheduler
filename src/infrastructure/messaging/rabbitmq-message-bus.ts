import { IMessageBus } from '../../domain/ports/IMessageBus'
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service'

export class RabbitMQMessageBus implements IMessageBus {
  constructor(private readonly rabbitmq: RabbitMQService) {}

  publish(routingKey: string, payload: Record<string, unknown>, exchange?: string): void {
    this.rabbitmq.publish(routingKey, payload, exchange)
  }
}
