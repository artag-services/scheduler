# Scheduler Service

> Tareas programadas (cron, interval, una sola vez) que pueden disparar cualquier acción del sistema — completamente agnóstico.

## Qué hace

Microservicio de **scheduling**. Permite programar tareas (recurrentes o one-shot) que cuando se disparan, publican un payload arbitrario a cualquier routing key de RabbitMQ. Eso lo hace **agnóstico**: no sabe nada de email, WhatsApp o cualquier otro servicio — solo "dispara este JSON a esta key cuando llegue el momento".

Ejemplos:
- "Cada 9am mandá un WhatsApp recordatorio a este número" → CRON → `channels.whatsapp.send`
- "Dentro de 30 min mandá este email de confirmación" → ONCE → `channels.email.send`
- "Cada hora limpiá los scraping jobs vencidos" → INTERVAL → `channels.scraping.cleanup-expired`

## Stack

| Pieza | Valor |
|---|---|
| Framework | NestJS 10 + `@nestjs/bullmq` |
| Lenguaje | TypeScript 5 |
| DB | PostgreSQL (`scheduler_db`) — persiste `ScheduledTask` + `TaskExecution` |
| Cache/Queue backend | Redis (BullMQ) |
| Mensajería | RabbitMQ — exchange `channels` |
| Dashboard | Bull Board UI en `/admin/queues` |
| Puerto | `3009` |

## Tipos de schedule

| `scheduleType` | Configuración requerida | Ejemplo |
|---|---|---|
| `CRON` | `cronExpression` (5 campos) + `timezone` | `"0 9 * * 1-5"` = lun-vie a las 9am |
| `INTERVAL` | `intervalMs` (mín 1000) | `60000` = cada minuto |
| `ONCE` | `runAt` (ISO datetime) | `"2026-12-25T00:00:00Z"` |

## Payload típico — crear tarea

```json
{
  "name": "Recordatorio diario",
  "scheduleType": "CRON",
  "cronExpression": "0 9 * * *",
  "timezone": "America/Bogota",
  "targetRoutingKey": "channels.whatsapp.send",
  "payload": {
    "recipients": ["573205711428"],
    "message": "Buenos días! Recordá revisar tus tareas."
  },
  "maxLatenessMs": 300000
}
```

Cada vez que el cron dispara (todos los días a las 9 hora Bogotá), el scheduler publica EL `payload` literal a `channels.whatsapp.send`. WhatsApp service lo consume como cualquier otro envío.

## Misfire policy — catch-up con ventana de gracia

Si el servicio estuvo caído cuando debía dispararse una tarea:
- Si la demora ≤ `maxLatenessMs` (default 5 min) → dispara tarde
- Si la demora > `maxLatenessMs` → marca como `SKIPPED_LATE` y espera al próximo

Esto previene que se acumulen 10 disparos perdidos cuando vuelve a estar arriba (lo cual sería spam).

## Idempotency automática

Cada disparo lleva un `idempotencyKey` derivado de `${taskId}-${scheduledFor.toISOString()}`. Si BullMQ reintenta un job (worker crash), el segundo disparo se detecta como duplicado en `TaskExecution.idempotencyKey` y no se ejecuta dos veces. Los servicios destino que soportan idempotency (email, etc.) usan ese key para no duplicar.

## Routing keys

| Routing key | Dirección |
|---|---|
| `channels.scheduler.create` | inbound (RPC) |
| `channels.scheduler.update` | inbound (RPC) |
| `channels.scheduler.delete` | inbound (fire-and-forget) |
| `channels.scheduler.pause` | inbound (RPC) |
| `channels.scheduler.resume` | inbound (RPC) |
| `channels.scheduler.trigger-now` | inbound (fire-and-forget) |
| `channels.scheduler.list` | inbound (RPC) |
| `channels.scheduler.get` | inbound (RPC) |
| `channels.scheduler.runs` | inbound (RPC) |
| `channels.scheduler.response` | outbound (RPC responses) |
| `channels.scheduler.task-fired` | outbound (broadcast cuando dispara) |

## Endpoints HTTP (vía gateway)

Ver [../docs/api/scheduler.md](../docs/api/scheduler.md).

| Método | Path |
|---|---|
| POST | `/api/v1/schedules` |
| GET | `/api/v1/schedules` |
| GET | `/api/v1/schedules/:id` |
| GET | `/api/v1/schedules/:id/runs` |
| PATCH | `/api/v1/schedules/:id` |
| POST | `/api/v1/schedules/:id/pause` |
| POST | `/api/v1/schedules/:id/resume` |
| POST | `/api/v1/schedules/:id/trigger` |
| DELETE | `/api/v1/schedules/:id` |

## Bull Board UI

UI en vivo para inspeccionar jobs:
- URL: `http://localhost:3009/admin/queues` (acceso directo al puerto del servicio)
- Muestra jobs activos, completed, failed, repeatable schedulers
- Permite retry manual, pausar colas, etc.

> No pasa por gateway — solo accesible internamente o vía port-forward SSH.

## Configuración (`.env`)

```env
SCHEDULER_PORT=3009
SCHEDULER_DATABASE_URL=postgresql://postgres:postgres123@postgres:5432/scheduler_db
RABBITMQ_URL=...
REDIS_HOST=redis
REDIS_PORT=6379
```

## Cron expressions útiles

| Expresión | Significado |
|---|---|
| `*/2 * * * *` | cada 2 minutos |
| `0 * * * *` | cada hora en punto |
| `0 9 * * *` | todos los días a las 9 AM |
| `0 9 * * 1-5` | lunes a viernes a las 9 AM |
| `30 14 * * 5` | viernes a las 14:30 |
| `0 0 1 * *` | día 1 de cada mes a medianoche |

Validador: https://crontab.guru

## Cómo correrlo

```bash
docker-compose up -d scheduler
```

Dev local:
```bash
cd scheduler
pnpm install
pnpm prisma:generate
pnpm start:dev
```

## Escala horizontal

Para correr N réplicas, simplemente agregás `replicas: 3` en docker-compose. BullMQ usa Redis como source of truth — cada job lo agarra una sola réplica vía atomic locking. Sin cambios de código.

## Ver también

- **[../docs/api/scheduler.md](../docs/api/scheduler.md)** — API reference completa
- **[../AGENTS.md](../AGENTS.md)**
