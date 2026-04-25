import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list() {
    return this.tasks.list();
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tasks.get(id);
  }

  @Get(':id/runs')
  runs(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.tasks.listExecutions(id, limit ?? 50);
  }

  @Post()
  create(@Body() dto: CreateTaskDto) {
    return this.tasks.create(dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(id, dto);
  }

  @Post(':id/pause')
  pause(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tasks.pause(id);
  }

  @Post(':id/resume')
  resume(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tasks.resume(id);
  }

  @Post(':id/trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  async trigger(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.tasks.triggerNow(id);
    return { triggered: true };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tasks.remove(id);
  }
}
