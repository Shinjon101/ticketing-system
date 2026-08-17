export function publicHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

export function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export function bookingHeaders(
  token: string,
  idempotencyKey: string,
): Record<string, string> {
  return {
    ...authHeaders(token),
    "Idempotency-Key": idempotencyKey,
  };
}
