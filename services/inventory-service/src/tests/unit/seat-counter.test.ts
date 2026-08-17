vi.mock("@/redis/index", () => ({
  redis: {
    set: vi.fn(),
    setnx: vi.fn(),
    get: vi.fn(),
    decr: vi.fn(),
    incr: vi.fn(),
  },
}));

import { redis } from "@/redis/index";
import { seatsCounter } from "@/redis/seat-counter";

describe("seatsCounter.seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("overwrites stale cached values instead of refusing to seed a valid count", async () => {
    await seatsCounter.seed("evt-123", 10);

    expect(redis.set).toHaveBeenCalledWith("seats:available:evt-123", 10);
    expect(redis.setnx).not.toHaveBeenCalled();
  });
});
