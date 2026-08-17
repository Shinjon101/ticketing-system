import http from "k6/http";
import { BASE_URL } from "../../config/config";
import { publicHeaders } from "../../config/headers";
import { check } from "k6";

export const register = (email, password) => {
  const res = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({ email, password }),
    { headers: publicHeaders },
  );

  const ok = check(res, { "registered: 201 created": (r) => r.status === 201 });

  if (!ok) {
    throw new Error(
      `register() failed for ${email}: HTTP ${res.status} — ${res.body}`,
    );
  }
  const body = JSON.parse(res.body);
  return {
    accessToken: body.accessToken,
    email,
    password,
  };
};

export function login(email, password) {
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

  return JSON.parse(res.body).accessToken;
}
