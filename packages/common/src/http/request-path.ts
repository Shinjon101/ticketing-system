import type { Request } from "express";

export const requestPath = (req: Request): string => {
  const queryStart = req.originalUrl.indexOf("?");
  return queryStart === -1
    ? req.originalUrl
    : req.originalUrl.slice(0, queryStart);
};
