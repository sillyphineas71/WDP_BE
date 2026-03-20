import {
  getFirebaseMessaging,
  isFirebaseConfigured,
} from "../config/firebase.js";
import { getRedisConnection, isRedisConfigured } from "../config/redis.js";
import { InternalServerError, NotFoundError } from "../errors/AppError.js";

const getUserDeviceKey = (userId) => `fcm:user:${userId}:tokens`;

export const saveDeviceToken = async ({ userId, token, platform = "web" }) => {
  if (!isRedisConfigured()) {
    throw new InternalServerError(
      "Redis configuration is missing. Device token storage requires Redis.",
    );
  }

  const redis = getRedisConnection();
  const payload = JSON.stringify({
    token,
    platform,
    updated_at: new Date().toISOString(),
  });

  await redis.sadd(getUserDeviceKey(userId), payload);

  return { token, platform };
};

export const removeDeviceToken = async ({ userId, token }) => {
  if (!isRedisConfigured()) {
    throw new InternalServerError(
      "Redis configuration is missing. Device token storage requires Redis.",
    );
  }

  const redis = getRedisConnection();
  const key = getUserDeviceKey(userId);
  const items = await redis.smembers(key);

  const matches = items.filter((item) => {
    try {
      return JSON.parse(item).token === token;
    } catch {
      return false;
    }
  });

  if (matches.length > 0) {
    await redis.srem(key, ...matches);
  }
};

export const getDeviceTokensByUserId = async (userId) => {
  if (!isRedisConfigured()) {
    return [];
  }

  const redis = getRedisConnection();
  const items = await redis.smembers(getUserDeviceKey(userId));

  return items
    .map((item) => {
      try {
        return JSON.parse(item);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

export const sendPushToUser = async ({ userId, title, body, data = {} }) => {
  if (!isFirebaseConfigured()) {
    throw new InternalServerError(
      "Firebase Admin configuration is missing. Please set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64.",
    );
  }

  const deviceTokens = await getDeviceTokensByUserId(userId);

  if (deviceTokens.length === 0) {
    throw new NotFoundError("No registered FCM token found for this user");
  }

  const messaging = getFirebaseMessaging();
  const tokenValues = deviceTokens.map((item) => item.token);

  const response = await messaging.sendEachForMulticast({
    tokens: tokenValues,
    notification: {
      title,
      body,
    },
    data: Object.entries(data).reduce((acc, [key, value]) => {
      acc[key] = String(value);
      return acc;
    }, {}),
  });

  const invalidTokens = [];

  response.responses.forEach((item, index) => {
    if (!item.success) {
      const code = item.error?.code || "";
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-argument")
      ) {
        invalidTokens.push(tokenValues[index]);
      }
    }
  });

  if (invalidTokens.length > 0) {
    await Promise.all(
      invalidTokens.map((token) => removeDeviceToken({ userId, token })),
    );
  }

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
  };
};
