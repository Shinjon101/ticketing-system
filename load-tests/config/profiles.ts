import { Options } from "k6/options";

export const smokeProfile: Options = {
  vus: 1,
  duration: "10s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

export const flashSaleProfile: Options = {
  setupTimeout: "180s",
  scenarios: {
    flashSale: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 600,
      maxVUs: 1000,
      stages: [
        { target: 100, duration: "20s" }, // ramp up
        { target: 400, duration: "20s" }, // ramp to peak
        { target: 400, duration: "30s" }, // HOLD at peak
        { target: 0, duration: "10s" }, // cool down
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1000"],
    saga_resolution_duration_ms: ["p(95)<5000"],
    k6_poll_timeout_total: ["count<10"],
  },
};

export const flashSaleCalibrationProfile: Options = {
  setupTimeout: "90s",
  scenarios: {
    flashSale: {
      executor: "ramping-arrival-rate",
      startRate: 16,
      timeUnit: "1s",
      preAllocatedVUs: 400,
      maxVUs: 800,
      stages: [
        { target: 160, duration: "20s" },
        { target: 160, duration: "20s" }, // HOLD at peak
        { target: 0, duration: "10s" },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1000"],
    saga_resolution_duration_ms: ["p(95)<5000"],
    k6_poll_timeout_total: ["count<10"],
  },
};
