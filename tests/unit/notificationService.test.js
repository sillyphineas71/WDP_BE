import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockAddNotificationJob = jest.fn();
const mockSendEmail = jest.fn();
const mockSendPushToUser = jest.fn();

await jest.unstable_mockModule("../../src/services/notificationQueue.js", () => ({
  addNotificationJob: mockAddNotificationJob,
  JOB_TYPES: {
    EMAIL: "email",
    PUSH: "push",
    EVENT: "event",
  },
}));

await jest.unstable_mockModule("../../src/services/emailService.js", () => ({
  sendEmail: mockSendEmail,
}));

await jest.unstable_mockModule("../../src/services/pushNotificationService.js", () => ({
  sendPushToUser: mockSendPushToUser,
}));

const { queueEmailNotification } = await import("../../src/services/notificationService.js");

describe("queueEmailNotification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns queued result when queue is available", async () => {
    mockAddNotificationJob.mockResolvedValue({ id: "job-123" });

    const payload = {
      to: "student@example.com",
      subject: "Reminder",
      text: "Hello",
    };

    const result = await queueEmailNotification(payload);

    expect(mockAddNotificationJob).toHaveBeenCalledWith("email", payload);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({
      queued: true,
      jobId: "job-123",
    });
  });

  test("falls back to inline email sending when queue insertion fails", async () => {
    mockAddNotificationJob.mockRejectedValue(new Error("queue-down"));
    mockSendEmail.mockResolvedValue({ success: true, simulated: true });

    const payload = {
      to: "teacher@example.com",
      subject: "Notice",
      text: "Inline send",
    };

    const result = await queueEmailNotification(payload);

    expect(mockAddNotificationJob).toHaveBeenCalledWith("email", payload);
    expect(mockSendEmail).toHaveBeenCalledWith(payload);
    expect(result).toEqual({
      queued: false,
      result: { success: true, simulated: true },
    });
  });
});
