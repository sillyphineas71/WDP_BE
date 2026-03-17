import { addNotificationJob, JOB_TYPES } from "./notificationQueue.js";
import { sendEmail } from "./emailService.js";
import { sendPushToUser } from "./pushNotificationService.js";

const runNowOrQueue = async ({ jobType, payload, handler }) => {
  try {
    const job = await addNotificationJob(jobType, payload);
    if (job) {
      return {
        queued: true,
        jobId: job.id,
      };
    }
  } catch (error) {
    console.warn(
      `Queue unavailable for ${jobType}, running inline:`,
      error.message,
    );
  }

  const result = await handler(payload);

  return {
    queued: false,
    result,
  };
};

export const queueEmailNotification = async (payload) => {
  return runNowOrQueue({
    jobType: JOB_TYPES.EMAIL,
    payload,
    handler: sendEmail,
  });
};

export const queuePushNotification = async (payload) => {
  return runNowOrQueue({
    jobType: JOB_TYPES.PUSH,
    payload,
    handler: sendPushToUser,
  });
};
