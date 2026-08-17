import http from "k6/http";
import { check } from "k6";
import { BASE_URL } from "../../config/config.ts";
import { publicHeaders } from "../../config/headers.ts";

export interface AuthCredentials {
  accessToken: string;
  email: string;
  password: string;
}

export function register(email: string, password: string): AuthCredentials {
  const res = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({ email, password }),
    { headers: publicHeaders() },
  );

  const ok = check(res, {
    "register: 201 Created": (r) => r.status === 201,
  });

  if (!ok) {
    throw new Error(
      `register() failed for ${email}: HTTP ${res.status} — ${res.body}`,
    );
  }

  const body = res.json() as { accessToken: string };
  return { accessToken: body.accessToken, email, password };
}

export function login(email: string, password: string): string {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: publicHeaders() },
  );

  const ok = check(res, {
    "login: 200 OK": (r) => r.status === 200,
  });

  if (!ok) {
    throw new Error(
      `login() failed for ${email}: HTTP ${res.status} — ${res.body}`,
    );
  }

  return (res.json() as { accessToken: string }).accessToken;
}
