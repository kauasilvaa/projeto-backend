import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    })
  : new Redis({
      host: "127.0.0.1",
      port: 6379,
      maxRetriesPerRequest: null,
    });