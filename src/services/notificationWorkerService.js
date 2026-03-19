import { Worker } from "bullmq";
import {
  getRedisConnection,
  isRedisConfigured,
} from "../config/redis.js";
import {
  JOB_TYPES,
  NOTIFICATION_QUEUE_NAME,
} from "./notificationQueue.js";
import { sendEmail } from "./emailService.js";
import { sendPushToUser } from "./pushNotificationService.js";

let notificationWorker;

const processNotificationJob = async (job) => {
  switch (job.name) {
    case JOB_TYPES.EMAIL:
      return sendEmail(job.data);
    case JOB_TYPES.PUSH:
      return sendPushToUser(job.data);
    default:
      throw new Error(`Unsupported notification job type: ${job.name}`);
  }
};

export const startNotificationWorker = () => {
  if (!isRedisConfigured()) {
    console.warn("Notification worker skipped because Redis is not configured");
    return null;
  }

  if (notificationWorker) {
    return notificationWorker;
  }

  notificationWorker = new Worker(
    NOTIFICATION_QUEUE_NAME,
    processNotificationJob,
    {
      connection: getRedisConnection(),
      concurrency: Number(process.env.NOTIFICATION_WORKER_CONCURRENCY || 5),
    },
  );

  notificationWorker.on("completed", (job) => {
    console.log(`Notification job ${job.id} completed`);
  });

  notificationWorker.on("failed", (job, error) => {
    console.error(`Notification job ${job?.id} failed:`, error.message);
  });

  return notificationWorker;
};

export const stopNotificationWorker = async () => {
  if (!notificationWorker) {
    return;
  }

  await notificationWorker.close();
  notificationWorker = null;
};
