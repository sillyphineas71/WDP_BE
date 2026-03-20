import IORedis from "ioredis";

let redisConnection;

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined) {
    return defaultValue;
  }

  return value === "true";
};

export const isRedisConfigured = () => {
  return Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
};

export const getRedisConnection = () => {
  if (!isRedisConfigured()) {
    throw new Error("Redis is not configured");
  }

  if (redisConnection) {
    return redisConnection;
  }

  if (process.env.REDIS_URL) {
    redisConnection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  } else {
    redisConnection = new IORedis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT || 6379),
      username: process.env.REDIS_USERNAME || undefined,
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB || 0),
      tls: parseBoolean(process.env.REDIS_TLS) ? {} : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }

  redisConnection.on("connect", () => {
    console.log("Redis connection established");
  });

  redisConnection.on("error", (error) => {
    console.error("Redis connection error:", error.message);
  });

  return redisConnection;
};

export const closeRedisConnection = async () => {
  if (!redisConnection) {
    return;
  }

  await redisConnection.quit();
  redisConnection = null;
};
