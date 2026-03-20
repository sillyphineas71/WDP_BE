import { User, Notification, sequelize } from "../models/index.js";
import { pushInAppNotification } from "../config/socket.js";
import {
  queueEmailNotification,
  queuePushNotification,
} from "./notificationService.js";

// ====== TEMPLATE REPOSITORY ======
// Có thể mở rộng ra DB nếu cần động hoá, nhưng hardcode object là đủ cho version MVP
const NOTIFICATION_TEMPLATES = {
  TEST_EVENT: {
    title: (params) => `Thông báo thử nghiệm: ${params.title || "N/A"}`,
    body: (params) => `Xin chào, đây là tin nhắn test từ hệ thống. MSG: ${params.message}`,
  },
  ACCOUNT_CREATED: {
    title: () => "Tài khoản của bạn đã được tạo thành công",
    body: (params) => `Chào mừng bạn đến với Smart Edu. Email đăng nhập của bạn là: ${params.email}.`,
  },
  SESSION_REMINDER: {
    title: (params) => `Nhắc nhở lịch học: ${params.course_code}`,
    body: (params) => `Lớp ${params.class_name} sẽ bắt đầu vào lúc ${params.start_time}. Phòng học: ${params.room}.`,
  },
  DEADLINE_WARNING: {
    title: (params) => `Nhắc nhở hạn nộp bài: ${params.assessment_title}`,
    body: (params) => `Bài tập môn ${params.course_name} sắp hết hạn vào lúc ${params.due_at}. Vui lòng nộp bài sớm.`,
  },
  GRADE_PUBLISHED: {
    title: (params) => `Đã có điểm: ${params.assessment_title}`,
    body: (params) => `Bài tập "${params.assessment_title}" của môn ${params.course_name} đã được chấm. Điểm của bạn: ${params.score}.`,
  },
};

/**
 * Hàm phân giải template dựa trên event_type và params.
 */
const renderContent = (eventType, params) => {
  const template = NOTIFICATION_TEMPLATES[eventType];
  if (!template) {
    throw new Error(`Event type '${eventType}' is not supported.`);
  }

  return {
    title: template.title(params),
    body: template.body(params),
  };
};

/**
 * Generic Processor cho UC_SYS_03
 *
 * payload format:
 * {
 *   event_type: "TEST_EVENT",
 *   user_ids: ["uuid1", "uuid2"],
 *   params: { key: "value" },
 *   channels: ["in_app", "email", "push"]
 * }
 */
export const processEventNotification = async (payload) => {
  const { event_type, user_ids, params, channels } = payload;

  if (!event_type || !user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    throw new Error("Invalid event payload: missing event_type or user_ids");
  }

  const selectedChannels = Array.isArray(channels) && channels.length > 0
    ? channels
    : ["in_app"]; // Default to in_app only

  // Render content
  const { title, body } = renderContent(event_type, params || {});

  // Fetch Users info from DB (to get emails and names)
  const users = await User.findAll({
    where: { id: user_ids },
    attributes: ["id", "full_name", "email"],
  });

  if (users.length === 0) {
    console.warn(`[EventNoti] No valid users found for event ${event_type}.`);
    return;
  }

  const notificationsToCreate = [];

  for (const user of users) {
    const personalizedBody = `Chào ${user.full_name},\n\n${body}\n\nTrân trọng,\nSmart Edu System`;

    // 1. IN-APP CHANNEL
    if (selectedChannels.includes("in_app")) {
      const notifRecord = {
        user_id: user.id,
        channel: "in_app",
        title: title,
        body: personalizedBody,
        ref_type: params?.ref_type || "SYSTEM", // Optional references
        ref_id: params?.ref_id || null,
        status: "sent",
        sent_at: new Date(),
      };
      notificationsToCreate.push(notifRecord);
      
      // Dispatch immediately to cache payload memory for socket
      const inAppPayload = { ...notifRecord, is_read: false, created_at: new Date() };
      pushInAppNotification(user.id, inAppPayload);
    }

    // 2. EMAIL CHANNEL
    if (selectedChannels.includes("email") && user.email) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>${title}</h2>
          <p>Xin chào <strong>${user.full_name}</strong>,</p>
          <p>${body}</p>
          <br/>
          <hr/>
          <p style="color: #666; font-size: 12px;">Tin nhắn tự động từ Hệ thống Smart Edu.</p>
        </div>
      `;

      queueEmailNotification({
        to: user.email,
        subject: title,
        html: emailHtml,
        text: personalizedBody,
      }).catch((err) =>
        console.error(`[EventNoti] Failed to queue email for ${user.email}:`, err.message),
      );
    }

    // 3. PUSH CHANNEL
    if (selectedChannels.includes("push")) {
      queuePushNotification({
        userId: user.id,
        title: title,
        body: body,
        data: {
          event_type: event_type,
          ref_id: String(params?.ref_id || ""),
        },
      }).catch((err) =>
        console.error(`[EventNoti] Failed to queue push for ${user.id}:`, err.message),
      );
    }
  }

  // Bulk Insert IN-APP records into database
  if (notificationsToCreate.length > 0) {
    try {
      await Notification.bulkCreate(notificationsToCreate);
      console.log(`[EventNoti] Created ${notificationsToCreate.length} in_app records for ${event_type}`);
    } catch (dbError) {
      console.error(`[EventNoti] Failed to bulk insert notifications:`, dbError.message);
    }
  }

  return { success: true, processedUsers: users.length, event: event_type };
};
