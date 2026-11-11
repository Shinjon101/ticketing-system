// Waiting time: a few ms when the saga is healthy, tens of seconds when it
// has backed up. The buckets have to cover both ends or p95 flattens out.
export const QUEUE_WAIT_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
];

// Work time: one DB transaction or one batch, normally well under a second.
export const WORK_DURATION_BUCKETS = [
  0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
];
