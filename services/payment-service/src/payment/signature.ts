import crypto from "crypto";

export const computePaymentSignature = (
  orderId: string,
  paymentId: string,
  secret: string,
): string =>
  crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

export const verifyPaymentSignature = (
  orderId: string,
  paymentId: string,
  secret: string,
  signature: string,
): boolean => computePaymentSignature(orderId, paymentId, secret) === signature;

export const verifyWebhookSignature = (
  rawBody: string,
  secret: string,
  signatureHeader: string,
): boolean => {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return expected === signatureHeader;
};
