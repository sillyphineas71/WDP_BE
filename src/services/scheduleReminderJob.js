import cron from "node-cron";
import { Op } from "sequelize";
import {
  sequelize,
  ClassSession,
  Class,
  Course,
  Enrollment,
  User,
  Notification,
} from "../models/index.js";
import {
  queueEmailNotification,
  queuePushNotification,
} from "./notificationService.js";
import { pushInAppNotification } from "../config/socket.js";

const processUpcomingSessions = async () => {
  try {
    const lookaheadHours = Number(
      process.env.SCHEDULE_SCAN_LOOKAHEAD_HOURS || 2,
    );
    const now = new Date();
    const futureLimit = new Date(now.getTime() + lookaheadHours * 60 * 60 * 1000);

    const upcomingSessions = await ClassSession.findAll({
      where: {
        status: "scheduled",
        is_reminded: false,
        start_time: {
          [Op.gte]: now,
          [Op.lte]: futureLimit,
        },
      },
      include: [
        {
          model: Class,
          as: "class",
          required: true,
          include: [
            {
              model: Course,
              as: "course",
              required: true,
              attributes: ["name", "code"],
            },
            {
              model: User,
              as: "teacher",
              required: true,
              attributes: ["id", "full_name", "email"],
            },
          ],
        },
      ],
    });

    if (upcomingSessions.length === 0) {
      console.log("[ScanSchedule] 0 records found, skipping");
      return;
    }

    let processedCount = 0;

    for (const session of upcomingSessions) {
      await sequelize.transaction(async (t) => {
        // Double check lock to prevent concurrent modifications
        const lockedSession = await ClassSession.findByPk(session.id, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!lockedSession || lockedSession.is_reminded || lockedSession.status !== "scheduled") {
          return; // Skip if already reminded or cancelled
        }

        const cls = session.class;
        const course = cls.course;
        const teacher = cls.teacher;
        const startTimeStr = session.start_time.toLocaleTimeString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          hour: "2-digit",
          minute: "2-digit",
        });
        
        const endTimeStr = session.end_time.toLocaleTimeString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          hour: "2-digit",
          minute: "2-digit",
        });

        const title = `Nhắc nhở lịch học: ${course.code} (${cls.name})`;
        const bodyTemplate = `${startTimeStr} - ${endTimeStr} / ${session.room || "Chưa xếp phòng"}`;

        // 1. Gather all recipients (Teacher + Active Students)
        const recipients = [
          {
            id: teacher.id,
            email: teacher.email,
            full_name: teacher.full_name,
            role: "Giảng viên",
          },
        ];

        const enrollments = await Enrollment.findAll({
          where: {
            class_id: cls.id,
            status: "active",
          },
          include: [
            {
              model: User,
              as: "student",
              required: true,
              attributes: ["id", "full_name", "email"],
            },
          ],
          transaction: t,
        });

        enrollments.forEach((enrollment) => {
          recipients.push({
            id: enrollment.student.id,
            email: enrollment.student.email,
            full_name: enrollment.student.full_name,
            role: "Học viên",
          });
        });

        // 2. Prepare and queue notifications for all recipients
        const notificationsToCreate = [];

        for (const recipient of recipients) {
          const personalizedBody = `Chào ${recipient.full_name},\n\nLớp ${cls.name} (Môn: ${course.name}) sắp bắt đầu.\n${startTimeStr} - ${endTimeStr} / ${session.room || "Chưa xếp phòng"}\n\nTrân trọng,\nSmart Edu System`;
          
          const emailHtml = `
            <h2>Nhắc nhở lịch học</h2>
            <p>Xin chào ${recipient.full_name},</p>
            <p>Lớp ${cls.name} (Môn: ${course.name}) sắp bắt đầu.</p>
            <p>Thời gian: ${startTimeStr} - ${endTimeStr}</p>
            <p>Phòng học: ${session.room || "Chưa xếp phòng"}</p>
            <p>Vui lòng chuẩn bị và tham gia đúng giờ.</p>
            <br/>
            <p>Trân trọng,</p>
            <p>Hệ thống Smart Edu</p>
          `;

          const newNotification = {
            user_id: recipient.id,
            channel: "in_app",
            title,
            body: bodyTemplate,
            ref_type: "SESSION",
            ref_id: session.id,
            status: "sent", // in_app is instant
            sent_at: new Date(),
          };

          // Pre-create DB records
          notificationsToCreate.push(newNotification);
          
          // Emit WebSocket event realtime
          pushInAppNotification(recipient.id, newNotification);

          // Queue push notification
          queuePushNotification({
            userId: recipient.id,
            title,
            body: bodyTemplate,
            data: {
              type: "SESSION_REMINDER",
              sessionId: session.id,
              classId: cls.id,
            },
          }).catch((err) =>
            console.error(`[ScanSchedule] Push queue failed for ${recipient.id}:`, err),
          );

          // Queue email notification
          if (recipient.email) {
            queueEmailNotification({
              to: recipient.email,
              subject: title,
              html: emailHtml,
              text: personalizedBody,
            }).catch((err) =>
              console.error(`[ScanSchedule] Email queue failed for ${recipient.email}:`, err),
            );
          }
        }

        // 3. Save to DB
        if (notificationsToCreate.length > 0) {
          await Notification.bulkCreate(notificationsToCreate, { transaction: t });
        }

        // 4. Update the reminder flag
        await lockedSession.update({ is_reminded: true }, { transaction: t });
        processedCount++;
      });
    }

    if (processedCount > 0) {
      console.log(`[ScanSchedule] Xử lý thành công ${processedCount} buổi học`);
    } else {
      console.log(`[ScanSchedule] 0 records found (no actionable sessions)`);
    }
  } catch (error) {
    console.error("[ScanSchedule] Lỗi khi chạy job ScanSchedule:", error);
  }
};

let scanScheduleTask;

export const startScheduleReminder = () => {
  if (scanScheduleTask) {
    return scanScheduleTask;
  }

  const cronExpression = process.env.SCHEDULE_SCAN_CRON || "*/15 * * * *";

  scanScheduleTask = cron.schedule(cronExpression, () => {
    console.log(`[ScanSchedule] Triggered scan at ${new Date().toISOString()}`);
    processUpcomingSessions();
  });

  console.log(
    `[ScanSchedule] Cron job configured to run with schedule: ${cronExpression}`,
  );
  
  // Run once on startup just to be safe (optional, but good practice for cron apps)
  // setTimeout(() => processUpcomingSessions(), 5000);

  return scanScheduleTask;
};

export const stopScheduleReminder = () => {
  if (scanScheduleTask) {
    scanScheduleTask.stop();
    scanScheduleTask = null;
    console.log("[ScanSchedule] Phân hệ ScanSchedule đã được dừng.");
  }
};
