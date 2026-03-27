import { User, Notification } from "../models/index.js";
import { pushInAppNotification } from "../config/socket.js";
import {
  queueEmailNotification,
  queuePushNotification,
} from "./notificationService.js";

const NOTIFICATION_TEMPLATES = {
  TEST_EVENT: {
    title: (params) => `Thong bao thu nghiem: ${params.title || "N/A"}`,
    body: (params) => `Xin chao, day la tin nhan test tu he thong. MSG: ${params.message}`,
  },
  ACCOUNT_CREATED: {
    title: () => "Tai khoan cua ban da duoc tao thanh cong",
    body: (params) => `Chao mung ban den voi Smart Edu. Email dang nhap cua ban la: ${params.email}.`,
  },
  SESSION_REMINDER: {
    title: (params) => `Nhac nho lich hoc: ${params.course_code}`,
    body: (params) => `Lop ${params.class_name} se bat dau vao luc ${params.start_time}. Phong hoc: ${params.room}.`,
  },
  DEADLINE_WARNING: {
    title: (params) => `Nhac nho han nop bai: ${params.assessment_title}`,
    body: (params) => `Bai tap mon ${params.course_name} sap het han vao luc ${params.due_at}. Vui long nop bai som.`,
  },
  GRADE_PUBLISHED: {
    title: (params) => `Da co diem: ${params.assessment_title}`,
    body: (params) => `Bai tap "${params.assessment_title}" cua mon ${params.course_name} da duoc cham. Diem cua ban: ${params.score}.`,
  },
  STREAM_POST_CREATED_TEACHER: {
    title: (params) => `${params.author_name} vua dang bai moi trong lop ${params.class_name}`,
    body: (params) =>
      `${params.post_type_label || "Bai dang"} moi: ${params.excerpt || "Hay mo Stream de xem chi tiet."}`,
  },
  STREAM_POST_CREATED_STUDENT: {
    title: (params) => `Co bai dang moi tu hoc vien trong lop ${params.class_name}`,
    body: (params) =>
      `${params.author_name} vua dang ${params.post_type_label?.toLowerCase() || "mot noi dung moi"}: ${params.excerpt || "Mo Stream de xem them."}`,
  },
  STREAM_COMMENT_CREATED: {
    title: (params) => `${params.author_name} vua binh luan trong lop ${params.class_name}`,
    body: (params) =>
      `${params.excerpt || "Co binh luan moi tren bai dang lien quan den ban."}`,
  },
  STREAM_POST_PINNED: {
    title: (params) => `Giang vien vua ghim mot bai dang trong lop ${params.class_name}`,
    body: (params) =>
      `${params.post_type_label || "Bai dang"} quan trong da duoc ghim: ${params.excerpt || "Mo Stream de xem chi tiet."}`,
  },
};

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

export const processEventNotification = async (payload) => {
  const { event_type, user_ids, params, channels } = payload;

  if (!event_type || !Array.isArray(user_ids) || user_ids.length === 0) {
    throw new Error("Invalid event payload: missing event_type or user_ids");
  }

  const selectedChannels =
    Array.isArray(channels) && channels.length > 0 ? channels : ["in_app"];

  const { title, body } = renderContent(event_type, params || {});

  const users = await User.findAll({
    where: { id: user_ids },
    attributes: ["id", "full_name", "email"],
  });

  if (users.length === 0) {
    console.warn(`[EventNoti] No valid users found for event ${event_type}.`);
    return;
  }

  const notificationsToCreate = [];
  const socketPayloads = []; // Store user_id -> notifRecord for socket push after DB insert

  for (const user of users) {
    const personalizedBody = `Chao ${user.full_name},\n\n${body}\n\nTran trong,\nSmart Edu System`;

    if (selectedChannels.includes("in_app")) {
      const createdAt = new Date();
      const notifRecord = {
        user_id: user.id,
        channel: "in_app",
        title,
        body: personalizedBody,
        ref_type: params?.ref_type || "SYSTEM",
        ref_id: params?.ref_id || null,
        status: "sent",
        sent_at: createdAt,
        created_at: createdAt,
      };
      notificationsToCreate.push(notifRecord);
      socketPayloads.push({ userId: user.id, record: notifRecord });
    }

    if (selectedChannels.includes("email") && user.email) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>${title}</h2>
          <p>Xin chao <strong>${user.full_name}</strong>,</p>
          <p>${body}</p>
          <br/>
          <hr/>
          <p style="color: #666; font-size: 12px;">Tin nhan tu dong tu He thong Smart Edu.</p>
        </div>
      `;

      queueEmailNotification({
        to: user.email,
        subject: title,
        html: emailHtml,
        text: personalizedBody,
      }).catch((error) =>
        console.error(`[EventNoti] Failed to queue email for ${user.email}:`, error.message),
      );
    }

    if (selectedChannels.includes("push")) {
      queuePushNotification({
        userId: user.id,
        title,
        body,
        data: {
          event_type,
          ref_id: String(params?.ref_id || ""),
        },
      }).catch((error) =>
        console.error(`[EventNoti] Failed to queue push for ${user.id}:`, error.message),
      );
    }
  }

  // Save to DB first, then push via socket WITH the DB-generated IDs
  if (notificationsToCreate.length > 0) {
    try {
      const createdRecords = await Notification.bulkCreate(notificationsToCreate, {
        returning: true,
      });
      console.log(
        `[EventNoti] Created ${createdRecords.length} in_app records for ${event_type}`,
      );

      // Push via socket with proper IDs
      createdRecords.forEach((record, index) => {
        const payload = socketPayloads[index];
        if (payload) {
          pushInAppNotification(payload.userId, {
            ...payload.record,
            id: record.id,
            is_read: false,
          });
        }
      });
    } catch (error) {
      console.error(`[EventNoti] Failed to bulk insert notifications:`, error.message);
      // Fallback: push via socket without IDs so user still sees notifications
      socketPayloads.forEach(({ userId, record }) => {
        pushInAppNotification(userId, { ...record, is_read: false });
      });
    }
  }

  return { success: true, processedUsers: users.length, event: event_type };
};
