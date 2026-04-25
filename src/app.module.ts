import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { PrismaModule } from './prisma/prisma.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { TasksModule } from './tasks/tasks.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST ?? 'redis',
          port: Number(process.env.REDIS_PORT ?? 6379),
        },
      }),
    }),
    PrismaModule,
    RabbitMQModule,
    SchedulerModule,
    TasksModule,
    AdminModule,
  ],
})
export class AppModule {}
