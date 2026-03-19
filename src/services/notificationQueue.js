import { Queue } from "bullmq";
import { getRedisConnection, isRedisConfigured } from "../config/redis.js";

export const NOTIFICATION_QUEUE_NAME = "notifications";

export const JOB_TYPES = {
  EMAIL: "email",
  PUSH: "push",
  EVENT: "event",
};

let notificationQueue;

export const getNotificationQueue = () => {
  if (!isRedisConfigured()) {
    return null;
  }

  if (notificationQueue) {
    return notificationQueue;
  }

  notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: Number(process.env.NOTIFICATION_JOB_ATTEMPTS || 3),
      backoff: {
        type: "exponential",
        delay: Number(process.env.NOTIFICATION_JOB_BACKOFF_MS || 5000),
      },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });

  return notificationQueue;
};

export const addNotificationJob = async (jobName, payload, options = {}) => {
  const queue = getNotificationQueue();

  if (!queue) {
    return null;
  }

  return queue.add(jobName, payload, options);
};
