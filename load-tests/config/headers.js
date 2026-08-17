export function publicHeaders() {
  return {
    "Content-Type": "application/json",
  };
}
export function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

export function bookingHeaders(token, idempotencyKey) {
  return {
    ...authHeaders(token),
    "Idempotency-Key": idempotencyKey,
  };
}
