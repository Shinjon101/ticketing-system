import { eventService } from "@/events/event.service";
import { eventsCache } from "@/events/events.cache";
import { eventsRepository } from "@/events/events.repository";
import { Event } from "@/events/events.table";
import { outboxRepository } from "@/outbox/outbox.repository";
import { TOPICS } from "@ticketing/kafka-client";
import { randomUUID } from "crypto";

vi.mock("@/db", () => ({
  db: { transaction: vi.fn((cb: any) => cb({})) },
}));

vi.mock("@/events/events.repository", () => ({
  eventsRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    createWithTx: vi.fn(),
    updateWithTx: vi.fn(),
  },
}));

vi.mock("@/outbox/outbox.repository", () => ({
  outboxRepository: { createWithTx: vi.fn() },
}));

vi.mock("@/events/events.cache", () => ({
  eventsCache: {
    getList: vi.fn(),
    setList: vi.fn(),
    invalidateList: vi.fn(),
    getDetail: vi.fn(),
    setDetail: vi.fn(),
    invalidateDetail: vi.fn(),
  },
}));

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: randomUUID(),
  title: "Test Concert",
  description: null,
  venue: "Test Arena",
  eventDate: new Date(Date.now() + 86_400_000),
  totalSeats: 100,
  price: 50_000,
  saleStartsAt: null,
  status: "draft",
  createdBy: randomUUID(),
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 0,
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe("eventService.getAll : cache-aside", () => {
  it("returns cached list without touching the repository on a cache hit", async () => {
    const cached = [makeEvent({ status: "active" })];
    vi.mocked(eventsCache.getList).mockResolvedValue(cached);

    const result = await eventService.getAll();

    expect(result).toBe(cached);
    expect(eventsRepository.findAll).not.toHaveBeenCalled();
  });

  it("falls back to the DB and repopulates the cache on a miss", async () => {
    const fromDb = [makeEvent({ status: "active" })];
    vi.mocked(eventsCache.getList).mockResolvedValue(null);
    vi.mocked(eventsRepository.findAll).mockResolvedValue(fromDb);

    const result = await eventService.getAll();

    expect(result).toBe(fromDb);
    expect(eventsCache.setList).toHaveBeenCalledWith(fromDb);
  });
});

describe("eventService.getById : cache-aside", () => {
  it("returns the cached event without querying the reposiotory", async () => {
    const cached = makeEvent();
    vi.mocked(eventsCache.getDetail).mockResolvedValue(cached);

    const result = await eventService.getById(cached.id);

    expect(result).toBe(cached);
    expect(eventsRepository.findById).not.toHaveBeenCalled();
  });

  it("throws 404 when the event exists in neither cache nor DB", async () => {
    vi.mocked(eventsCache.getDetail).mockResolvedValue(null);
    vi.mocked(eventsRepository.findById).mockResolvedValue(undefined as any);

    await expect(eventService.getById("missing-id")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("caches the event on a DB hit", async () => {
    const event = makeEvent();
    vi.mocked(eventsCache.getDetail).mockResolvedValue(null);
    vi.mocked(eventsRepository.findById).mockResolvedValue(event);

    const result = await eventService.getById(event.id);

    expect(result).toBe(event);
    expect(eventsCache.setDetail).toHaveBeenCalledWith(event);
  });
});

describe("eventService.create", () => {
  it("writes an EVENT_CREATED outbox row inside the same transaction and invalidates the list cache", async () => {
    const created = makeEvent();
    vi.mocked(eventsRepository.createWithTx).mockResolvedValue(created);

    const result = await eventService.create({
      title: created.title,
      venue: created.venue,
      eventDate: created.eventDate,
      totalSeats: created.totalSeats,
      price: created.price,
      createdBy: created.createdBy,
    });

    expect(result).toBe(created);
    expect(outboxRepository.createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: TOPICS.EVENT_CREATED,
        payload: expect.objectContaining({
          eventId: created.id,
          version: created.version,
          totalSeats: created.totalSeats,
          price: created.price,
        }),
      }),
    );
    expect(eventsCache.invalidateList).toHaveBeenCalled();
  });
});

describe("eventService.update", () => {
  it("throws 404 when the event doesn't exist", async () => {
    vi.mocked(eventsRepository.findById).mockResolvedValue(undefined as any);

    await expect(
      eventService.update("missing-id", { title: "New title" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 400 when the event is already cancelled — cancelled is terminal", async () => {
    vi.mocked(eventsRepository.findById).mockResolvedValue(
      makeEvent({ status: "cancelled" }),
    );

    await expect(
      eventService.update("some-id", { title: "New title" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(outboxRepository.createWithTx).not.toHaveBeenCalled();
  });

  it("updates the event and queues an EVENT_UPDATED outbox row with a full snapshot", async () => {
    const existing = makeEvent({ status: "draft" });
    const updated = { ...existing, title: "New title" };
    vi.mocked(eventsRepository.findById).mockResolvedValue(existing);
    vi.mocked(eventsRepository.updateWithTx).mockResolvedValue(updated);

    const result = await eventService.update(existing.id, {
      title: "New title",
    });

    expect(result).toBe(updated);
    expect(outboxRepository.createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: TOPICS.EVENT_UPDATED,
        payload: expect.objectContaining({
          eventId: existing.id,
          version: updated.version,
          title: updated.title,
          totalSeats: updated.totalSeats,
          price: updated.price,
          eventDate: updated.eventDate.toISOString(),
          status: updated.status,
          saleStartsAt: null,
        }),
      }),
    );
    expect(eventsCache.invalidateDetail).toHaveBeenCalledWith(existing.id);
  });
});

describe("eventService.cancel", () => {
  it("throws 404 when the event doesn't exist", async () => {
    vi.mocked(eventsRepository.findById).mockResolvedValue(undefined as any);

    await expect(eventService.cancel("missing-id")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws 400 when the event is already cancelled — cancel is not idempotent by design", async () => {
    vi.mocked(eventsRepository.findById).mockResolvedValue(
      makeEvent({ status: "cancelled" }),
    );

    await expect(eventService.cancel("some-id")).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(outboxRepository.createWithTx).not.toHaveBeenCalled();
  });

  it("sets status to cancelled and queues EVENT_UPDATED so Booking Service can react", async () => {
    const existing = makeEvent({ status: "active" });
    const updated = { ...existing, status: "cancelled" as const };
    vi.mocked(eventsRepository.findById).mockResolvedValue(existing);
    vi.mocked(eventsRepository.updateWithTx).mockResolvedValue(updated);

    await eventService.cancel(existing.id);

    expect(eventsRepository.updateWithTx).toHaveBeenCalledWith(
      expect.anything(),
      existing.id,
      { status: "cancelled" },
    );
    expect(outboxRepository.createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: TOPICS.EVENT_UPDATED,
        payload: expect.objectContaining({
          eventId: existing.id,
          version: updated.version,
          title: updated.title,
          totalSeats: updated.totalSeats,
          price: updated.price,
          eventDate: updated.eventDate.toISOString(),
          status: updated.status,
          saleStartsAt: null,
        }),
      }),
    );
    expect(eventsCache.invalidateDetail).toHaveBeenCalledWith(existing.id);
  });
});
