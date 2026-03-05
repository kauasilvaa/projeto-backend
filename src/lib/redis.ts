import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      connectTimeout: 5000,
    })
  : null;


if (redis) {
  redis.on("error", (err) => {
    console.error("[redis] error:", err?.message ?? err);
  });
}