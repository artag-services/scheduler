import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { ScheduleType } from '@prisma/client';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ScheduleType)
  scheduleType!: ScheduleType;

  @ValidateIf((o: CreateTaskDto) => o.scheduleType === 'CRON')
  @IsString()
  @IsNotEmpty()
  cronExpression?: string;

  @ValidateIf((o: CreateTaskDto) => o.scheduleType === 'INTERVAL')
  @IsInt()
  @Min(1000)
  intervalMs?: number;

  @ValidateIf((o: CreateTaskDto) => o.scheduleType === 'ONCE')
  @IsString()
  @IsNotEmpty()
  runAt?: string; // ISO datetime

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  targetExchange?: string;

  @IsString()
  @IsNotEmpty()
  targetRoutingKey!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsInt()
  @IsOptional()
  @Min(0)
  maxRetries?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  retryBackoffMs?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  maxLatenessMs?: number;

  @IsString()
  @IsOptional()
  createdBy?: string;
}
