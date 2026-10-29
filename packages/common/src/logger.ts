import pino from "pino";
import type { DestinationStream, Logger, LoggerOptions } from "pino";
import { z } from "zod";

export const logLevelSchema = z.enum([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);

export type LogLevel = z.infer<typeof logLevelSchema>;

export interface CreateLoggerOptions {
  name: string;
  level: LogLevel;
  pretty?: boolean;
  destination?: DestinationStream;
}

const SENSITIVE_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-razorpay-signature",
];

const SENSITIVE_FIELDS = [
  "password",
  "passwordHash",
  "accessToken",
  "refreshToken",
  "razorpaySignature",
];

const REDACT_PATHS = [
  ...SENSITIVE_HEADERS.flatMap((header) => [
    `headers["${header}"]`,
    `*.headers["${header}"]`,
  ]),
  ...SENSITIVE_FIELDS.flatMap((field) => [field, `*.${field}`]),
];

export const createLogger = ({
  name,
  level,
  pretty = false,
  destination,
}: CreateLoggerOptions): Logger => {
  const options: LoggerOptions = {
    name,
    level,
    redact: REDACT_PATHS,
    transport: pretty
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        }
      : undefined,
  };

  return destination ? pino(options, destination) : pino(options);
};
