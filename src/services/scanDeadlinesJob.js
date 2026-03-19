import cron from "node-cron";
import { Op } from "sequelize";
import {
  sequelize,
  Assessment,
  Class,
  Course,
  Enrollment,
  User,
  Submission,
  Notification,
} from "../models/index.js";
import {
  queueEmailNotification,
  queuePushNotification,
} from "./notificationService.js";

// Task 1: Warn students about upcoming deadlines (if they haven't submitted)
const processUpcomingDeadlines = async () => {
  try {
    const lookaheadHours = Number(process.env.DEADLINE_SCAN_LOOKAHEAD_HOURS || 24);
    const now = new Date();
    const futureLimit = new Date(now.getTime() + lookaheadHours * 60 * 60 * 1000);

    const upcomingAssessments = await Assessment.findAll({
      where: {
        status: "published",
        reminder_sent: false,
        due_at: {
          [Op.not]: null,
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
          ],
        },
      ],
    });

    if (upcomingAssessments.length === 0) {
      console.log("[DeadlineScanner][Warn] 0 upcoming assessments found.");
      return;
    }

    let processedCount = 0;

    for (const assessment of upcomingAssessments) {
      await sequelize.transaction(async (t) => {
        const lockedAssessment = await Assessment.findByPk(assessment.id, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (
          !lockedAssessment ||
          lockedAssessment.reminder_sent ||
          lockedAssessment.status !== "published"
        ) {
          return;
        }

        const cls = assessment.class;
        const course = cls.course;
        const dueAtStr = assessment.due_at.toLocaleString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
        });

        const title = `Nhắc nhở nộp bài: ${assessment.title}`;
        const bodyTemplate = `Bạn có bài tập "${assessment.title}" của lớp ${cls.name} (Môn: ${course.name}) sẽ hết hạn vào lúc ${dueAtStr}. Hãy hoàn thành sớm nhé!`;

        // 1. Get all active enrollments for this class
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

        // 2. Get all SUBMITTED submissions for this assessment
        const existingSubmissions = await Submission.findAll({
          where: {
            assessment_id: assessment.id,
            status: "submitted", // Ignore "draft" or anything not submitted
          },
          attributes: ["student_id"],
          transaction: t,
        });

        const submittedStudentIds = new Set(
          existingSubmissions.map((sub) => sub.student_id),
        );

        // 3. Filter out students who have already submitted
        const studentsToWarn = enrollments
          .map((e) => e.student)
          .filter((student) => !submittedStudentIds.has(student.id));

        const notificationsToCreate = [];

        for (const student of studentsToWarn) {
          const personalizedBody = `Chào ${student.full_name},\n\n${bodyTemplate}\n\nTrân trọng,\nSmart Edu System`;

          const emailHtml = `
            <h2>Nhắc nhở hạn nộp bài tập</h2>
            <p>Xin chào ${student.full_name},</p>
            <p>${bodyTemplate}</p>
            <p>Vui lòng đăng nhập hệ thống và nộp bài đúng hạn.</p>
            <br/>
            <p>Trân trọng,</p>
            <p>Hệ thống Smart Edu</p>
          `;

          notificationsToCreate.push({
            user_id: student.id,
            channel: "in_app",
            title,
            body: personalizedBody,
            ref_type: "ASSESSMENT",
            ref_id: assessment.id,
            status: "sent",
            sent_at: new Date(),
          });

          // Queue push
          queuePushNotification({
            userId: student.id,
            title,
            body: bodyTemplate,
            data: {
              type: "ASSESSMENT_DEADLINE_WARNING",
              assessmentId: assessment.id,
              classId: cls.id,
            },
          }).catch((err) =>
            console.error(
              `[DeadlineScanner] Push queue failed warning for ${student.id}:`,
              err,
            ),
          );

          // Queue email
          if (student.email) {
            queueEmailNotification({
              to: student.email,
              subject: title,
              html: emailHtml,
              text: personalizedBody,
            }).catch((err) =>
              console.error(
                `[DeadlineScanner] Email queue failed warning for ${student.email}:`,
                err,
              ),
            );
          }
        }

        // Save DB notifications
        if (notificationsToCreate.length > 0) {
          await Notification.bulkCreate(notificationsToCreate, {
            transaction: t,
          });
        }

        // Mark assessment as warned
        await lockedAssessment.update({ reminder_sent: true }, { transaction: t });
        processedCount++;
      });
    }

    if (processedCount > 0) {
      console.log(
        `[DeadlineScanner][Warn] Xử lý thành công gửi nhắc nhở cho ${processedCount} bài tập.`,
      );
    }
  } catch (error) {
    console.error("[DeadlineScanner][Warn] Lỗi khi nhắc nhở bài tập:", error);
  }
};

// Task 2: Lock past-due assessments
const processPastDueAssessments = async () => {
  try {
    const now = new Date();

    // Query Strategy:
    // Status is 'published'.
    // EITHER cutoff_at is passed OR (cutoff_at is null but due_at is passed)
    const pastDueAssessments = await Assessment.findAll({
      where: {
        status: "published",
        [Op.or]: [
          {
            cutoff_at: {
              [Op.not]: null,
              [Op.lt]: now,
            },
          },
          {
            cutoff_at: null,
            due_at: {
              [Op.not]: null,
              [Op.lt]: now,
            },
          },
        ],
      },
    });

    if (pastDueAssessments.length === 0) {
      console.log("[DeadlineScanner][Lock] 0 past-due assessments found.");
      return;
    }

    let closedCount = 0;

    for (const assessment of pastDueAssessments) {
      await sequelize.transaction(async (t) => {
        const lockedAssessment = await Assessment.findByPk(assessment.id, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!lockedAssessment || lockedAssessment.status !== "published") {
          return;
        }

        // Convert to closed
        await lockedAssessment.update({ status: "closed" }, { transaction: t });
        closedCount++;
      });
    }

    if (closedCount > 0) {
      console.log(
        `[DeadlineScanner][Lock] Đã khóa tự động ${closedCount} bài tập quá hạn.`,
      );
    }
  } catch (error) {
    console.error("[DeadlineScanner][Lock] Lỗi khi khóa bài tập:", error);
  }
};

const runDeadlineScannerTasks = async () => {
  console.log(`[DeadlineScanner] Start scanning at ${new Date().toISOString()}`);
  await processUpcomingDeadlines();
  await processPastDueAssessments();
};

let scanDeadlinesTask;

export const startDeadlineScanner = () => {
  if (scanDeadlinesTask) {
    return scanDeadlinesTask;
  }

  const cronExpression = process.env.DEADLINE_SCAN_CRON || "*/30 * * * *";

  scanDeadlinesTask = cron.schedule(cronExpression, runDeadlineScannerTasks);

  console.log(
    `[DeadlineScanner] Cron job configured to run with schedule: ${cronExpression}`,
  );

  return scanDeadlinesTask;
};

export const stopDeadlineScanner = () => {
  if (scanDeadlinesTask) {
    scanDeadlinesTask.stop();
    scanDeadlinesTask = null;
    console.log("[DeadlineScanner] Phân hệ Deadline Scanner đã được dừng.");
  }
};
