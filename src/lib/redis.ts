import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;


export const redis = REDIS_URL
  ? new Redis(REDIS_URL, {
      lazyConnect: true,        
      maxRetriesPerRequest: 1, 
      enableOfflineQueue: false 
    })
  : null;


let warned = false;
if (redis) {
  redis.on("error", () => {
    if (!warned) {
      warned = true;
      console.log("[redis] indisponível — rodando sem cache (ok)");
    }
  });
}