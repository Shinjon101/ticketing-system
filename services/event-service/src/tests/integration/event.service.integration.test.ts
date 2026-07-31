import { connectDB, db } from "@/db";
import { eq } from "@ticketing/db";
import { eventService } from "@/events/event.service";
import { events } from "@/events/events.table";
import { outboxEvents } from "@/outbox/outbox.table";
import { randomUUID } from "crypto";
import { TOPICS } from "@ticketing/kafka-client";
import { eventsRepository } from "@/events/events.repository";

vi.mock("@/events/events.cache", () => ({
  eventsCache: {
    getList: vi.fn().mockResolvedValue(null),
    setList: vi.fn(),
    invalidateList: vi.fn(),
    getDetail: vi.fn().mockResolvedValue(null),
    setDetail: vi.fn(),
    invalidateDetail: vi.fn(),
  },
}));

beforeAll(() => connectDB());
afterEach(async () => {
  await db.delete(events);
  await db.delete(outboxEvents);
});

const baseInput = () => ({
  title: "Concert",
  venue: "Arena",
  eventDate: new Date(Date.now() + 86_400_000),
  totalSeats: 100,
  price: 50_000,
  createdBy: randomUUID(),
});

describe("eventService.create : outbox transactional integrity against a real DB", () => {
  it("writes the event row and its EVENT_CREATED outbox row atomically", async () => {
    const created = await eventService.create(baseInput());

    const [eventRow] = await db
      .select()
      .from(events)
      .where(eq(events.id, created.id));
    expect(eventRow).toBeDefined();

    const [outboxRow] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.topic, TOPICS.EVENT_CREATED));
    expect(outboxRow).toBeDefined();
    expect(outboxRow.published).toBe(false);
    expect((outboxRow.payload as { eventId: string }).eventId).toBe(created.id);
    expect((outboxRow.payload as { totalSeats: number }).totalSeats).toBe(100);
  });
});

describe("eventService.update:  cancelled is terminal, enforced against real state", () => {
  it("throws 400 and writes no outbox row when the event is already cancelled", async () => {
    const created = await eventService.create(baseInput());
    await eventService.cancel(created.id);
    await db.delete(outboxEvents);

    await expect(
      eventService.update(created.id, { title: "Won't apply" }),
    ).rejects.toMatchObject({ statusCode: 400 });

    const outboxRows = await db.select().from(outboxEvents);
    expect(outboxRows).toHaveLength(0);
  });
});

describe("eventsRepository.findAll — public listing never leaks drafts", () => {
  it("excludes draft events and returns only active ones", async () => {
    const draftEvent = await eventService.create(baseInput());
    expect(draftEvent.status).toBe("draft");

    const [activeEvent] = await db
      .insert(events)
      .values({
        ...baseInput(),
        eventDate: new Date(Date.now() + 2 * 86_400_000),
        status: "active",
      })
      .returning();

    const results = await eventsRepository.findAll();
    const ids = results.map((e) => e.id);

    expect(ids).toContain(activeEvent.id);
    expect(ids).not.toContain(draftEvent.id);
  });
});
