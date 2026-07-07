vi.mock("@/config/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/config/env", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4007,
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_PUBLIC_KEY: "test-key",
    KAFKA_BROKERS: "localhost:9092",
    RAZORPAY_KEY_ID: "rzp_test_dummy",
    RAZORPAY_KEY_SECRET: "dummy_key_secret",
    RAZORPAY_WEBHOOK_SECRET: "dummy_webhook_secret",
    LOG_LEVEL: "error",
  },
}));

vi.mock("@/payment/hold.repository", () => ({
  holdRepository: {
    findByBookingId: vi.fn(),
    upsertWithTx: vi.fn(),
    isProcessed: vi.fn(),
    markProcessedWithTx: vi.fn(),
  },
}));
vi.mock("@/payment/payment.repository", () => ({
  paymentRepository: {
    findByOrderId: vi.fn(),
    createWithTx: vi.fn(),
    markCapturedWithTx: vi.fn(),
  },
}));

const { mockOrdersCreate } = vi.hoisted(() => ({ mockOrdersCreate: vi.fn() }));

vi.mock("razorpay", () => ({
  default: vi.fn().mockImplementation(function (this: any) {
    this.orders = { create: mockOrdersCreate };
  }),
}));

import { randomUUID } from "crypto";
import { paymentService } from "@/payment/payment.service";
import { holdRepository } from "@/payment/hold.repository";
import { paymentRepository } from "@/payment/payment.repository";
import type { Hold } from "@/payment/hold.table";

const makeHold = (overrides: Partial<Hold> = {}): Hold => ({
  bookingId: randomUUID(),
  userId: randomUUID(),
  eventId: randomUUID(),
  seatIds: ["seat-1"],
  seatNumbers: ["Seat 1"],
  amount: 5000,
  razorpayOrderId: null,
  expiresAt: new Date(Date.now() + 60_000),
  status: "pending",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe("paymentService.createOrder — guard clauses", () => {
  it("throws 404 when there's no hold for the booking", async () => {
    vi.mocked(holdRepository.findByBookingId).mockResolvedValue(undefined);
    await expect(
      paymentService.createOrder("booking-x", "user-x"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 403 when the hold belongs to a different user", async () => {
    vi.mocked(holdRepository.findByBookingId).mockResolvedValue(
      makeHold({ userId: "someone-else" }),
    );
    await expect(
      paymentService.createOrder("booking-x", "me"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 409 when the hold is not pending", async () => {
    vi.mocked(holdRepository.findByBookingId).mockResolvedValue(
      makeHold({ userId: "me", status: "completed" }),
    );
    await expect(
      paymentService.createOrder("booking-x", "me"),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 410 when the hold has expired", async () => {
    vi.mocked(holdRepository.findByBookingId).mockResolvedValue(
      makeHold({ userId: "me", expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(
      paymentService.createOrder("booking-x", "me"),
    ).rejects.toMatchObject({ statusCode: 410 });
  });

  it("reuses an existing Razorpay order instead of creating a duplicate", async () => {
    const hold = makeHold({ userId: "me", razorpayOrderId: "order_existing" });
    vi.mocked(holdRepository.findByBookingId).mockResolvedValue(hold);
    vi.mocked(paymentRepository.findByOrderId).mockResolvedValue({
      id: "pay-row-1",
      bookingId: hold.bookingId,
      razorpayOrderId: "order_existing",
      razorpayPaymentId: null,
      razorpaySignature: null,
      amount: hold.amount,
      currency: "INR",
      status: "created",
      failureReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await paymentService.createOrder(hold.bookingId, "me");

    expect(result.orderId).toBe("order_existing");
    expect(mockOrdersCreate).not.toHaveBeenCalled(); // no duplicate order created
  });
});

describe("paymentService.verifyPayment — guard clauses that return before any DB write", () => {
  it("throws 404 when there's no hold", async () => {
    vi.mocked(holdRepository.findByBookingId).mockResolvedValue(undefined);
    await expect(
      paymentService.verifyPayment(
        "booking-x",
        "me",
        "order_1",
        "pay_1",
        "sig_1",
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 403 for a mismatched user", async () => {
    vi.mocked(holdRepository.findByBookingId).mockResolvedValue(
      makeHold({ userId: "someone-else" }),
    );
    await expect(
      paymentService.verifyPayment(
        "booking-x",
        "me",
        "order_1",
        "pay_1",
        "sig_1",
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 409 when the hold is already settled", async () => {
    vi.mocked(holdRepository.findByBookingId).mockResolvedValue(
      makeHold({ userId: "me", status: "failed" }),
    );
    await expect(
      paymentService.verifyPayment(
        "booking-x",
        "me",
        "order_1",
        "pay_1",
        "sig_1",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
