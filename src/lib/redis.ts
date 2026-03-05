import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl
  ? new Redis(redisUrl, { maxRetriesPerRequest: 1, enableReadyCheck: false })
  : new Redis({
      host: process.env.REDIS_HOST ?? "127.0.0.1",
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });