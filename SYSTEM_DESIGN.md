# Ticketing System — System Design Document

**Status:** V1 — Implementation-focused  
**Goal:** Learn system design, DevOps, scalability, and performance step-by-step  
**Last updated:** April 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [Scope](#3-scope)
4. [System Architecture](#4-system-architecture)
5. [Data Ownership](#5-data-ownership)
6. [Services Breakdown](#6-services-breakdown)
7. [Data Models](#7-data-models)
8. [Kafka Event Contracts](#8-kafka-event-contracts)
9. [Redis Usage](#9-redis-usage)
10. [Core Flows](#10-core-flows)
11. [Design Patterns](#11-design-patterns)
12. [API Reference](#12-api-reference)
13. [Infrastructure](#13-infrastructure)
14. [Observability](#14-observability)
15. [Load Testing](#15-load-testing)
16. [Architecture Decision Records](#16-architecture-decision-records)
17. [Future Phases](#17-future-phases)

---

## 1. Project Overview

**Ticketing System** is a distributed ticket booking platform designed to safely handle high-concurrency booking of limited seats without overselling.

### Key problem being solved

During a flash sale, thousands of users simultaneously attempt to book the last few available seats. Without proper locking and event-driven coordination, the system would oversell — confirming more bookings than seats exist. This system prevents that using Postgres row-level locking and an async saga pattern via Kafka.

### Seat assignment model

This system uses **Model A — system assigns seats.** Users do not pick a specific seat. They request "1 seat for event X" and the system assigns the next available one. The assigned seat is returned in the booking confirmation.

This means:

- `POST /bookings` takes `{ eventId }` — no `seatId` from the client
- Inventory Service picks the seat using `FOR UPDATE SKIP LOCKED`
- The assigned `seatId` only appears in the `seat.reserved` response event

---

## 2. Goals and Non-Goals

### Goals

- Handle 1,000+ concurrent booking requests without overselling
- Guarantee eventual consistency across services
- Recover correctly from partial failures (service crash mid-saga)
- Structured observability — metrics and logs
- Keep the system simple — every component must justify its existence

### Non-goals

- Not a full SaaS product — no billing, multi-tenancy, or polished UI
- No real-time seat map — users don't pick specific seats (Model A)
- No email or SMS notifications in V1
- No admin dashboard beyond basic REST APIs
- No multi-region deployment

---

## 3. Scope

### Included in V1

- Auth + User Service
- Booking Service (core saga logic)
- Inventory Service (seat assignment + locking)
- Event Service (event creation + seat seeding)
- Kafka (all inter-service communication)
- PostgreSQL (one database per service)
- Redis (idempotency, event cache, availability counter)
- Docker + Kubernetes (local with Kind)
- CI/CD (GitHub Actions)
- Observability (Prometheus + Grafana + structured logs)

### Excluded — deferred to later phases

- Payment Service (Phase 2)
- API Gateway (Phase 2)
- Notification Service (Phase 3)
- Distributed tracing — OpenTelemetry + Jaeger (Phase 3)
- AWS deployment + Terraform (Phase 4)

---

## 4. System Architecture

### Communication rule

**Async only.** Kafka handles all inter-service communication in V1. There are no HTTP calls between services. If Event Service is down, Booking Service still works because it reads cached event data from Redis.

### High-level overview

![alt text](image.png)

### Technology stack

| Concern          | Technology                         | Reason                                             |
| ---------------- | ---------------------------------- | -------------------------------------------------- |
| Runtime          | Node.js + TypeScript               | Async I/O suits event-driven architecture          |
| Framework        | Express                            | Familiar, industry standard                        |
| ORM              | Drizzle ORM                        | Lightweight, type-safe, raw SQL access when needed |
| Database         | PostgreSQL 16                      | ACID guarantees, `FOR UPDATE` row-level locking    |
| Message broker   | Apache Kafka                       | Durable, replayable, consumer group semantics      |
| Cache            | Redis 7                            | Fast in-memory ops, TTL support, atomic NX ops     |
| Containerisation | Docker (multi-stage builds)        | Reproducible environments                          |
| Orchestration    | Kubernetes via Kind (local)        | Industry standard, horizontal scaling              |
| CI/CD            | GitHub Actions                     | Integrated with repo                               |
| Observability    | Prometheus + Grafana + Pino + Loki | Full metrics and structured log stack              |
| Load testing     | k6                                 | Scriptable, handles 1000+ virtual users            |

---

## 5. Data Ownership

> No shared databases. No cross-service joins. Ever.

| Entity   | Owner Service     | How other services access it                              |
| -------- | ----------------- | --------------------------------------------------------- |
| Users    | Auth Service      | Other services read `userId` from the decoded JWT         |
| Events   | Event Service     | Booking Service caches event metadata via `event.created` |
| Seats    | Inventory Service | Seeded by consuming `event.created` — no direct access    |
| Bookings | Booking Service   | Inventory only knows `bookingId` as a plain reference     |

`event_id` in the seats table is a plain UUID column — not a foreign key to Event Service's database.

---

## 6. Services Breakdown

### 6.1 Auth + User Service

**Responsibility:** Authentication and user identity

**Handles:**

- User registration and login
- JWT access token issuance (15-min expiry)
- Refresh token management (7-day expiry)
- User profile CRUD

**Produces (Kafka):** nothing in V1  
**Consumes (Kafka):** nothing in V1

**Note:** No service calls Auth at runtime. The JWT is verified locally using the shared public key.

---

### 6.2 Event Service

**Responsibility:** Admin-facing event management

**Handles:**

- Create, update, and cancel events
- Emit Kafka events so downstream services can react

**Produces (Kafka):**

- `event.created` — when admin creates a new event
- `event.updated` — when admin changes price, seat count, or status

**Consumes (Kafka):** nothing in V1

> Event Service does NOT own or manage seat rows. It only publishes event data.  
> Inventory Service creates seat rows in its own DB by reacting to `event.created`.

---

### 6.3 Inventory Service

**Responsibility:** Source of truth for seat availability and assignment

**Handles:**

- Seeding seat rows when a new event is created
- Assigning an available seat using `FOR UPDATE SKIP LOCKED`
- Emitting reservation success or failure back to Booking Service

**Produces (Kafka):**

- `seat.reserved` — seat successfully assigned to a booking
- `seat.failed` — no seats available

**Consumes (Kafka):**

- `event.created` → bulk inserts seat rows, sets Redis availability counter
- `seat.reserve_requested` → picks and locks an available seat

**Locking strategy (Model A):**

```sql
-- Pick ANY available seat and lock it atomically
SELECT id FROM seats
WHERE event_id = $eventId
AND status = 'available'
ORDER BY seat_number
LIMIT 1
FOR UPDATE SKIP LOCKED;
-- SKIP LOCKED: skip seats currently contested by other transactions.
-- Each concurrent request gets a different seat rather than queuing on one.
-- If no rows returned: no available seats → emit seat.failed.
```

**Why `SKIP LOCKED` for Model A:**  
Under flash sale conditions, thousands of users all request "any available seat." `SKIP LOCKED` spreads those requests across all available seats. Each transaction takes a different seat instead of everyone fighting over seat 1. Once all seats are held, queries return empty and `seat.failed` is emitted.

---

### 6.4 Booking Service

**Responsibility:** Core business logic and saga coordination

**Handles:**

- Booking creation — validates event exists via Redis cache
- Publishing `seat.reserve_requested` via the outbox pattern
- Reacting to inventory outcomes and updating booking status
- Idempotency enforcement — prevents duplicate bookings

**Produces (Kafka):**

- `seat.reserve_requested` — published via outbox poller

**Consumes (Kafka):**

- `event.created` → caches event metadata in Redis for local validation
- `event.updated` → invalidates event cache in Redis
- `seat.reserved` → transitions booking to `confirmed`
- `seat.failed` → transitions booking to `failed`

**Booking state machine:**

```
pending ──► confirmed   (terminal success in V1 — seat assigned and locked)
        └─► failed      (terminal failure — no seats available)

confirmed ──► cancelled (user cancels — triggers seat release in Inventory, Phase 2)
```

> `confirmed` is the terminal success state in V1. Payment is Phase 2.  
> A confirmed booking means a seat is locked in Inventory's database.

---

## 7. Data Models

### Auth Service — `users`

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### Event Service — `events`

```sql
CREATE TABLE events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  venue          TEXT NOT NULL,
  event_date     TIMESTAMPTZ NOT NULL,
  total_seats    INTEGER NOT NULL,
  price          INTEGER NOT NULL,       -- in paise (smallest currency unit)
  sale_starts_at TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'active' | 'cancelled'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### Inventory Service — `seats`

```sql
CREATE TABLE seats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL,            -- plain UUID, NOT a FK to events DB
  seat_number TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'available',  -- 'available' | 'held' | 'booked'
  held_by     UUID,                     -- bookingId currently holding this seat
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (event_id, seat_number)
);

-- Drives the FOR UPDATE SKIP LOCKED query
CREATE INDEX idx_seats_event_available
  ON seats (event_id, seat_number)
  WHERE status = 'available';
```

---

### Booking Service — `bookings`

```sql
CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  event_id        UUID NOT NULL,
  seat_id         UUID,                 -- NULL until seat.reserved arrives
  status          TEXT NOT NULL DEFAULT 'pending',
                  -- 'pending' | 'confirmed' | 'failed' | 'cancelled'
  amount          INTEGER NOT NULL,     -- price at time of booking, in paise
  idempotency_key TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Booking Service — `outbox_events`

```sql
CREATE TABLE outbox_events (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic     TEXT NOT NULL,
  payload   JSONB NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Poller only scans unpublished rows
CREATE INDEX idx_outbox_unpublished
  ON outbox_events (created_at)
  WHERE published = FALSE;
```

### All Kafka-consuming services — `processed_events`

Each service that consumes Kafka events has its own copy:

```sql
CREATE TABLE processed_events (
  message_id   TEXT PRIMARY KEY,    -- messageId from Kafka payload
  topic        TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 8. Kafka Event Contracts

All payloads are defined as Zod schemas in `packages/kafka-client/schemas.ts`.  
Producers get a compile-time error for malformed payloads.  
Consumers get a runtime validation error and route to a Dead Letter Queue.

---

### `event.created`

**Producer:** Event Service  
**Consumers:** Inventory Service, Booking Service

```typescript
{
  messageId: string; // UUID — for consumer idempotency
  eventId: string;
  title: string;
  totalSeats: number;
  price: number; // in paise — Booking needs this for amount validation
  eventDate: string; // ISO 8601
  status: "active" | "draft";
}
```

---

### `event.updated`

**Producer:** Event Service  
**Consumer:** Booking Service

```typescript
{
  messageId: string;
  eventId: string;
  changes: {
    title?: string;
    price?: number;
    totalSeats?: number;
    status?: 'active' | 'draft' | 'cancelled';
  };
}
```

---

### `seat.reserve_requested`

**Producer:** Booking Service (via outbox)  
**Consumer:** Inventory Service

```typescript
{
  messageId: string; // UUID — for consumer idempotency
  bookingId: string;
  userId: string;
  eventId: string;
  requestedAt: string; // ISO 8601
}
```

> No `seatId` here. The client does not choose a seat.  
> Inventory picks the seat. `seatId` only appears in `seat.reserved`.

---

### `seat.reserved`

**Producer:** Inventory Service  
**Consumer:** Booking Service

```typescript
{
  messageId: string;
  bookingId: string;
  seatId: string; // assigned by Inventory — first time seatId appears
  seatNumber: string; // human-readable e.g. "Seat 42"
  reservedAt: string; // ISO 8601
}
```

---

### `seat.failed`

**Producer:** Inventory Service  
**Consumer:** Booking Service

```typescript
{
  messageId: string;
  bookingId: string;
  reason: "no_seats_available" | "event_not_found";
}
```

---

> **Not in V1:**  
> `booking.confirmed`, `payment.completed`, `payment.failed`, and `booking.expired`
> do not exist in V1. The saga ends at `seat.reserved` → booking `confirmed`.  
> These topics will be introduced in Phase 2 when Payment Service is added.

---

## 9. Redis Usage

> Redis is never the source of truth. Postgres always is.  
> Redis is a performance layer only.

| Key pattern                 | Owner             | Strategy      | TTL   | Purpose                                          |
| --------------------------- | ----------------- | ------------- | ----- | ------------------------------------------------ |
| `event:{eventId}`           | Booking Service   | Cache-aside   | 1 hr  | Validate event locally without calling Event Svc |
| `idempotency:{key}`         | Booking Service   | NX flag       | 24 hr | Prevent duplicate booking submissions            |
| `seats:available:{eventId}` | Inventory Service | Write-through | none  | Fast availability display — not used for locking |

### Cache-aside — event metadata

```typescript
// Booking Service consumes event.created:
await redis.set(`event:${eventId}`, JSON.stringify(payload), "EX", 3600);

// At booking request time — no HTTP call to Event Service:
const cached = await redis.get(`event:${eventId}`);
if (!cached) throw new EventNotFoundError(eventId);
const event = JSON.parse(cached);

// Validate sale window
if (new Date() < new Date(event.saleStartsAt)) {
  throw new SaleNotOpenError();
}
```

### Cache invalidation on event.updated

```typescript
// Booking Service consumes event.updated:
await redis.del(`event:${eventId}`);
// Next booking request gets a cache miss and returns EventNotFoundError
// until Booking Service re-receives or re-seeds the cache
```

### Idempotency

```typescript
const key = `idempotency:${idempotencyKey}`;
const set = await redis.set(key, bookingId, "NX", "EX", 86400);
if (!set) {
  // Already processed — return the original booking
  return getBookingById(existingBookingId);
}
```

---

## 10. Core Flows

### 10.1 Successful booking

```
① Client → POST /bookings
   Body: { eventId }          ← no seatId, user does not choose
   Headers: Idempotency-Key: <uuid>

② Booking Service:
   - GET idempotency:{key} from Redis → not found, proceed
   - GET event:{eventId} from Redis → validate event is active + sale is open
   - BEGIN TRANSACTION
       INSERT INTO bookings (status='pending', seat_id=NULL, amount=event.price)
       INSERT INTO outbox_events (topic='seat.reserve_requested',
         payload={ messageId, bookingId, userId, eventId })
     COMMIT
   - SET idempotency:{key} = bookingId EX 86400
   - Return 202 Accepted { bookingId }

③ Outbox poller (runs inside Booking Service every ~200ms):
   SELECT FROM outbox_events WHERE published = FALSE
   FOR UPDATE SKIP LOCKED LIMIT 100
   → Publishes seat.reserve_requested to Kafka
   → UPDATE outbox_events SET published = TRUE

④ Inventory Service consumes seat.reserve_requested:
   - SELECT message_id FROM processed_events WHERE message_id = ? → not found
   - BEGIN TRANSACTION
       SELECT id, seat_number FROM seats
       WHERE event_id = $eventId AND status = 'available'
       ORDER BY seat_number
       LIMIT 1
       FOR UPDATE SKIP LOCKED
       → Row returned: seat_id = "uuid-of-seat-42", seat_number = "Seat 42"

       UPDATE seats SET status = 'held', held_by = $bookingId
       WHERE id = $seatId

       INSERT INTO processed_events (message_id, topic)
     COMMIT
   - DECR seats:available:{eventId} in Redis
   - Publish seat.reserved { bookingId, seatId, seatNumber: "Seat 42" }

⑤ Booking Service consumes seat.reserved:
   - SELECT message_id FROM processed_events → not found
   - BEGIN TRANSACTION
       UPDATE bookings SET status = 'confirmed', seat_id = $seatId
       INSERT INTO processed_events (message_id, topic)
     COMMIT

⑥ User polls → GET /bookings/{bookingId}
   Response: { status: 'confirmed', seat: 'Seat 42' }
```

---

### 10.2 Failed booking — no seats available

```
Steps ①–③ identical.

④ Inventory Service consumes seat.reserve_requested:
   - SELECT FROM processed_events → not found
   - BEGIN TRANSACTION
       SELECT id FROM seats
       WHERE event_id = $eventId AND status = 'available'
       LIMIT 1 FOR UPDATE SKIP LOCKED
       → 0 rows returned (all seats held or booked)
     COMMIT (nothing to update)
   - Publish seat.failed { bookingId, reason: 'no_seats_available' }

⑤ Booking Service consumes seat.failed:
   - UPDATE bookings SET status = 'failed'

⑥ User polls → GET /bookings/{bookingId}
   Response: { status: 'failed', reason: 'no_seats_available' }
```

In a 1000-user flash sale for 100 seats: the first 100 concurrent transactions each claim a different seat via `SKIP LOCKED`. The remaining 900 find 0 rows available and emit `seat.failed` immediately. No waiting, no queue buildup.

---

### 10.3 Event creation — seeding seats in Inventory

```
① Admin → POST /events { title, totalSeats: 200, price: 50000, saleStartsAt, ... }

② Event Service:
   BEGIN TRANSACTION
     INSERT INTO events (...)
     INSERT INTO outbox_events (topic='event.created',
       payload={ eventId, title, totalSeats: 200, price: 50000, saleStartsAt, ... })
   COMMIT
   Return 201 Created { eventId }

③ Outbox poller publishes event.created to Kafka.

④ Inventory Service consumes event.created:
   - Check processed_events → not found
   - Bulk insert 200 seat rows:
     INSERT INTO seats (event_id, seat_number, status)
     SELECT $eventId, 'Seat ' || gs, 'available'
     FROM generate_series(1, 200) gs
   - SET seats:available:{eventId} = 200 in Redis
   - INSERT INTO processed_events

⑤ Booking Service consumes event.created:
   - Check processed_events → not found
   - SET event:{eventId} = { title, price, saleStartsAt, status } EX 3600
   - INSERT INTO processed_events

After step ⑤: Booking Service can validate any booking for this event
using the Redis cache — zero calls to Event Service at runtime.
```

---

## 11. Design Patterns

### 11.1 Outbox pattern

**Problem:** Writing to Postgres and publishing to Kafka are two operations. A crash between them leaves the system in a corrupt state — a booking exists with no Kafka event, or vice versa.

**Solution:** Write the Kafka payload to an `outbox_events` table inside the same DB transaction as the booking. A poller process publishes the rows and marks them done.

```typescript
await db.transaction(async (tx) => {
  const [booking] = await tx
    .insert(bookings)
    .values({ userId, eventId, status: "pending", amount })
    .returning();

  await tx.insert(outbox_events).values({
    topic: "seat.reserve_requested",
    payload: {
      messageId: crypto.randomUUID(),
      bookingId: booking.id,
      userId,
      eventId,
      requestedAt: new Date().toISOString(),
    },
  });

  return booking;
});
```

**Poller — why `SKIP LOCKED` matters here too:**

```sql
SELECT * FROM outbox_events
WHERE published = FALSE
ORDER BY created_at
FOR UPDATE SKIP LOCKED   -- multiple poller replicas don't block each other
LIMIT 100;
```

Without `SKIP LOCKED`, two Booking Service replicas would queue up on the same rows. With it, each replica takes a different batch and processes in parallel.

---

### 11.2 Saga pattern (choreography)

No central orchestrator. Services react to each other's Kafka events.

```
Booking ──► seat.reserve_requested ──► Inventory
                                            │
                               ┌────────────┴───────────────┐
                               ▼                            ▼
                          seat.reserved               seat.failed
                               │                            │
                               ▼                            ▼
                     Booking → confirmed           Booking → failed
```

The saga is complete when Booking reaches a terminal state. If it reaches `failed`, Inventory never committed a seat change — no rollback needed.

---

### 11.3 HTTP request idempotency

Prevents duplicate bookings from client retries (network timeout, double-tap):

```typescript
const key = `idempotency:${req.headers["idempotency-key"]}`;
const existing = await redis.get(key);
if (existing) {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, existing),
  });
  return reply.status(200).send(booking);
}
// Not seen — process and cache result
```

---

### 11.4 Kafka consumer idempotency

Kafka guarantees at-least-once delivery. A consumer can receive the same message more than once after a crash or rebalance. Without idempotency, Inventory Service could assign two seats for the same booking.

Every consumer checks `processed_events` before acting:

```typescript
async function handleSeatReserveRequested(msg: SeatReserveRequestedEvent) {
  const seen = await db.query.processed_events.findFirst({
    where: eq(processed_events.message_id, msg.messageId),
  });
  if (seen) return; // already handled — ack and skip

  await db.transaction(async (tx) => {
    // ... assign seat, update status ...

    // Mark processed inside the same transaction
    await tx.insert(processed_events).values({
      message_id: msg.messageId,
      topic: "seat.reserve_requested",
    });
  });
}
```

The insert into `processed_events` is inside the same transaction as the business logic. If the transaction rolls back, the record is also rolled back — the message will be retried correctly next time.

---

## 12. API Reference

### Auth endpoints

```
POST  /auth/register    Register new user
POST  /auth/login       Login — returns access token + refresh token
POST  /auth/logout      Revoke current session
POST  /auth/refresh     Exchange refresh token for new access token
GET   /auth/me          Get current user profile
```

### Event endpoints

```
GET   /events           List all active events
GET   /events/:id       Get event details + available seat count
POST  /events           [admin] Create event
PUT   /events/:id       [admin] Update event
DELETE /events/:id      [admin] Cancel event
```

### Booking endpoints

```
POST  /bookings         Create a booking — returns 202 + bookingId
                        Body: { eventId }
                        Header: Idempotency-Key: <uuid>

GET   /bookings/:id     Get booking status + assigned seat
GET   /bookings/me      Get current user's bookings
```

---

## 13. Infrastructure

### Local development

```bash
# Start all infrastructure
docker-compose up -d
# Starts: Kafka, Postgres x4, Redis, Prometheus, Grafana, Kafka UI

# Start all services in watch mode
pnpm run dev --filter=*
```

### Kubernetes — local (Kind)

```bash
kind create cluster --config infra/k8s/kind-config.yaml
kubectl apply -k infra/k8s/overlays/local
```

Each service runs as a `Deployment` with:

- 2 replicas
- `readinessProbe` on `GET /health`
- `ConfigMap` for non-secret config
- `Secret` for DB password, JWT secret, Redis URL
- `HorizontalPodAutoscaler` on CPU (target 70%)

**Scaling note:** Scale Inventory Service carefully. More replicas = more concurrent Kafka consumers = more parallel seat locking. This is intentional and correct — but watch DB connection pool usage.

### CI/CD — GitHub Actions

```
On Pull Request:
  1. TypeScript check (tsc --noEmit)
  2. Lint (ESLint)
  3. Unit tests (Vitest)
  4. Integration tests (Testcontainers — real Kafka + Postgres)
  5. Docker build

On merge to main:
  1. All PR checks
  2. Docker build + tag with commit SHA
  3. Smoke test — full booking flow end to end
```

---

## 14. Observability

### Metrics (Prometheus)

Each service exposes `GET /metrics` in Prometheus format.

| Metric                             | Type      | Service   | Alert threshold      |
| ---------------------------------- | --------- | --------- | -------------------- |
| `bookings_created_total`           | Counter   | Booking   | —                    |
| `bookings_by_status_total{status}` | Counter   | Booking   | —                    |
| `saga_duration_seconds`            | Histogram | Booking   | p99 > 5s             |
| `inventory_lock_attempts_total`    | Counter   | Inventory | —                    |
| `inventory_lock_failures_total`    | Counter   | Inventory | rate > 50/min        |
| `kafka_consumer_lag{topic,group}`  | Gauge     | All       | > 1000 messages      |
| `outbox_unpublished_total`         | Gauge     | Booking   | > 500 (poller stuck) |
| `db_query_duration_seconds`        | Histogram | All       | p99 > 200ms          |
| `http_request_duration_seconds`    | Histogram | All       | p99 > 1s             |

**Grafana dashboards:**

1. Booking overview — rate, success %, saga duration p50/p95/p99
2. Inventory health — lock attempts, failures, available seat count
3. Kafka health — consumer lag per topic, outbox backlog

### Structured logs (Pino)

```json
{
  "level": "info",
  "time": "2026-04-13T10:00:00.000Z",
  "service": "booking-service",
  "bookingId": "uuid",
  "userId": "uuid",
  "eventId": "uuid",
  "msg": "Booking created, outbox event queued"
}
```

All logs shipped to Loki. Filter by `bookingId` to trace a full saga across services.

---

## 15. Load Testing

Tool: k6

### Scenario 1 — seat race (correctness)

```
500 virtual users → all book the same eventId simultaneously
Event has 1 seat remaining

Pass: exactly 1 confirmed, exactly 499 failed
Fail: any run produces 2+ confirmed bookings for the same event seat
```

### Scenario 2 — flash sale (concurrency + throughput)

```
1000 virtual users → all book the same eventId simultaneously
Event has 100 seats

Pass:
  - Exactly 100 confirmed, exactly 900 failed
  - Zero oversell
  - Booking API p99 < 1s
  - Saga end-to-end p95 < 5s
  - Kafka consumer lag returns to 0 within 60s of peak
```

### Scenario 3 — sustained load (stability)

```
200 virtual users booking across multiple events for 10 minutes

Pass:
  - No memory growth over time
  - DB connection pool < 80% saturation
  - Outbox backlog stays near 0
  - Zero DB timeout errors
```

---

## 16. Architecture Decision Records

### ADR-001 — Saga choreography over orchestration

**Decision:** Services emit and consume Kafka events directly. No central orchestrator.

**Why:** No single point of failure. Services are independently deployable. New services can join the saga by subscribing to existing events.

**Tradeoff:** Harder to trace the full saga path. Requires explicit compensation logic for every failure mode.

---

### ADR-002 — Outbox pattern for Kafka publishing

**Decision:** The Kafka event is written to an `outbox_events` table in the same DB transaction as the business record. A poller publishes it to Kafka.

**Why:** Eliminates the dual-write problem. The DB transaction is atomic — either both the booking and the outbox row are written, or neither is.

**Tradeoff:** Small latency added by the poller interval (~200ms). Outbox table needs periodic cleanup of old published rows.

---

### ADR-003 — `FOR UPDATE SKIP LOCKED` for seat assignment (Model A)

**Decision:** Inventory uses `SELECT ... FOR UPDATE SKIP LOCKED` to pick any available seat, skipping rows currently locked by other transactions.

**Why:** Under flash sale concurrency, `SKIP LOCKED` distributes requests across all available seats instead of creating contention on a single row. Fails immediately when no seats remain.

**Tradeoff:** Seat assignment is arbitrary — users get whatever seat is available, not a specific one. This is intentional in Model A.

---

### ADR-004 — Separate database per service

**Decision:** Each service owns its own Postgres database.

**Why:** True loose coupling. Schema changes in one service cannot break another. Services can be scaled and migrated independently.

**Tradeoff:** No cross-service joins. Shared data must be passed via events or cached locally (e.g. event metadata in Booking's Redis).

---

### ADR-005 — Model A seat assignment

**Decision:** The system assigns seats. Users request `{ eventId }` only. Inventory picks the seat.

**Why:** Eliminates the need for a seat map UI, real-time seat status broadcasting, and user-facing seat contention. Lets V1 focus entirely on the distributed systems problems.

**Tradeoff:** Users cannot choose a specific seat. Model B (user picks seat) is deferred to a future phase.

---

## 17. Future Phases

### Phase 2 — Payment + API Gateway

- API Gateway: JWT verification at edge, rate limiting, routing
- Payment Service: Razorpay mock integration
- New Kafka topics: `booking.confirmed`, `payment.completed`, `payment.failed`
- Compensation flow: `payment.failed` → release seat in Inventory
- 2-minute seat hold with expiry cleanup job

### Phase 3 — Resilience + Observability

- Distributed tracing (OpenTelemetry + Jaeger)
- Dead Letter Queue for poison pill Kafka messages
- Retry with exponential backoff for transient DB/Redis failures
- Notification Service (email/SMS on booking confirmation)

### Phase 4 — AWS Deployment

- Terraform: EKS, RDS per service, Amazon MSK, ElastiCache
- GitHub Actions CD pipeline to EKS
- VPC, private subnets, ALB ingress
- HPA with custom Kafka lag metric
- AWS Secrets Manager via External Secrets Operator

---

_This document is the source of truth for V1 design decisions.  
Add an ADR before implementing any significant new decision — not after._
