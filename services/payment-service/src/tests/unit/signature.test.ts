import crypto from "crypto";
import {
  computePaymentSignature,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "@/payment/signature";

describe("verifyPaymentSignature", () => {
  const secret = "test_key_secret";
  const orderId = "order_abc123";
  const paymentId = "pay_xyz789";

  it("accepts a signature computed over the same inputs", () => {
    const sig = computePaymentSignature(orderId, paymentId, secret);
    expect(verifyPaymentSignature(orderId, paymentId, secret, sig)).toBe(true);
  });

  it("rejects a single flipped character (tamper detection)", () => {
    const sig = computePaymentSignature(orderId, paymentId, secret);
    const tampered = sig.slice(0, -1) + (sig.at(-1) === "0" ? "1" : "0");
    expect(verifyPaymentSignature(orderId, paymentId, secret, tampered)).toBe(
      false,
    );
  });

  it("rejects a signature produced with the wrong secret", () => {
    const sig = computePaymentSignature(orderId, paymentId, "wrong-secret");
    expect(verifyPaymentSignature(orderId, paymentId, secret, sig)).toBe(false);
  });

  it("rejects cross-payment replay: a valid signature for a different order/payment pair", () => {
    const sig = computePaymentSignature(orderId, paymentId, secret);
    expect(
      verifyPaymentSignature("order_different", paymentId, secret, sig),
    ).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifyPaymentSignature(orderId, paymentId, secret, "")).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  const secret = "webhook_test_secret";
  const rawBody = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_1", order_id: "order_1" } } },
  });
  const sign = (body: string, key = secret) =>
    crypto.createHmac("sha256", key).update(body).digest("hex");

  it("accepts a signature computed over the exact raw body", () => {
    expect(verifyWebhookSignature(rawBody, secret, sign(rawBody))).toBe(true);
  });

  it("rejects if the body is re-serialized differently — same data, different bytes", () => {
    const reformatted = JSON.stringify(JSON.parse(rawBody), null, 2);
    expect(verifyWebhookSignature(reformatted, secret, sign(rawBody))).toBe(
      false,
    );
  });

  it("rejects a signature computed with the wrong secret", () => {
    expect(
      verifyWebhookSignature(rawBody, secret, sign(rawBody, "wrong-secret")),
    ).toBe(false);
  });
});
