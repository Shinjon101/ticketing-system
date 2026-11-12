import { Options } from "k6/options";

export const smokeProfile: Options = {
  vus: 1,
  duration: "10s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

// Sized from env so the peak can change without editing code
const PEAK_RATE = parseInt(__ENV.PEAK_RATE || "40", 10);
const RAMP = __ENV.RAMP || "20s";
const HOLD = __ENV.HOLD || "2m";

// Each iteration keeps a VU busy while it polls for seat_held: about a second
// when healthy, much longer once the saga backs up. With too few VUs k6 sends
// less than PEAK_RATE, which dropped_iterations below catches.
const MAX_VUS = parseInt(__ENV.MAX_VUS || String(PEAK_RATE * 10), 10);

export const flashSaleProfile: Options = {
  setupTimeout: "180s",
  tags: { testid: `flash-${PEAK_RATE}` },
  scenarios: {
    flashSale: {
      executor: "ramping-arrival-rate",
      startRate: Math.max(1, Math.round(PEAK_RATE / 10)),
      timeUnit: "1s",
      preAllocatedVUs: Math.min(MAX_VUS, PEAK_RATE * 3),
      maxVUs: MAX_VUS,
      stages: [
        { target: PEAK_RATE, duration: RAMP },
        { target: PEAK_RATE, duration: HOLD }, // HOLD at peak
        { target: 0, duration: "10s" },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1000"],
    saga_resolution_duration_ms: ["p(95)<5000"],
    k6_poll_timeout_total: ["count<10"],
    // Non-zero means k6 itself ran out of VUs, so the system never saw the
    // intended rate and the run doesn't measure what it claims to.
    dropped_iterations: ["count==0"],
  },
};
