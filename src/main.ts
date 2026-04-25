import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT ?? 3009;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Scheduler service running on port ${port}`);
  logger.log(`Bull Board UI: http://localhost:${port}/admin/queues`);
}

bootstrap();
