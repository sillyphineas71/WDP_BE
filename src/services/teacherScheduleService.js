// src/services/teacherScheduleService.js
import { Op } from "sequelize";
import {
  ClassSession,
  Class,
  Course,
  User,
  Enrollment,
  AttendanceRecord,
  Material,
} from "../models/index.js";

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

const httpError = (message, statusCode, code, details) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  if (details) err.details = details;
  return err;
};

const assertUUID = (id, field) => {
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    throw httpError(`Invalid ${field}. Must be UUID.`, 400, "VALIDATION_ERROR", {
      field,
      value: id,
    });
  }
};

const parseISODate = (value, field) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw httpError(
      `Giá trị ${field} không hợp lệ. Phải là ngày ISO (VD: 2026-03-01).`,
      400,
      "VALIDATION_ERROR",
      { field, value },
    );
  }
  return d;
};

/**
 * Tính trạng thái hiển thị (BR_CAL_02) cho một buổi học.
 *
 *  - cancelled      : buổi đã bị hủy
 *  - completed      : buổi đã hoàn thành (đã điểm danh)
 *  - missing_attendance : đã qua nhưng chưa điểm danh
 *  - ongoing        : đang diễn ra
 *  - upcoming       : sắp diễn ra
 */
const computeDisplayStatus = (session) => {
  if (session.status === "cancelled") return "cancelled";
  if (session.status === "done") return "completed";

  const now = new Date();
  const startTime = new Date(session.start_time);
  const endTime = new Date(session.end_time);

  // Buổi đã qua nhưng status vẫn là "scheduled" → GV quên chưa điểm danh
  if (endTime < now) return "missing_attendance";
  // Đang diễn ra
  if (startTime <= now && endTime >= now) return "ongoing";
  // Sắp diễn ra
  return "upcoming";
};

// ────────────────────────────────────────────
// 1. GET TEACHER SCHEDULE (Calendar)
// ────────────────────────────────────────────

/**
 * Lấy lịch giảng dạy của giảng viên trong khoảng thời gian [from, to].
 * BR_CAL_01: Chỉ trả về các buổi học của lớp mà teacher_id = teacherId.
 *
 * @param {string} teacherId - UUID giảng viên (từ JWT)
 * @param {object} query     - { from, to, class_id? }
 */
export const getTeacherSchedule = async (teacherId, query) => {
  assertUUID(teacherId, "teacherId");

  const { from, to, class_id } = query;

  // from và to là bắt buộc
  if (!from || !to) {
    throw httpError(
      "Tham số 'from' và 'to' là bắt buộc (VD: ?from=2026-03-01&to=2026-03-31).",
      400,
      "VALIDATION_ERROR",
    );
  }

  const fromDate = parseISODate(from, "from");
  const toDate = parseISODate(to, "to");

  if (fromDate > toDate) {
    throw httpError(
      "'from' phải trước hoặc bằng 'to'.",
      400,
      "VALIDATION_ERROR",
    );
  }

  // Điều kiện lọc ClassSession
  const sessionWhere = {
    start_time: { [Op.lt]: toDate },   // bắt đầu trước to
    end_time: { [Op.gt]: fromDate },    // kết thúc sau from
  };

  // Điều kiện lọc Class — LUÔN lọc theo teacher_id (BR_CAL_01)
  const classWhere = { teacher_id: teacherId };
  if (class_id) {
    assertUUID(class_id, "class_id");
    classWhere.id = class_id;
  }

  const sessions = await ClassSession.findAll({
    where: sessionWhere,
    include: [
      {
        model: Class,
        as: "class",
        required: true, // INNER JOIN — chỉ lấy buổi học thuộc lớp của GV
        where: classWhere,
        attributes: ["id", "name"],
        include: [
          {
            model: Course,
            as: "course",
            required: true,
            attributes: ["id", "code", "name"],
          },
        ],
      },
    ],
    attributes: [
      "id",
      "class_id",
      "start_time",
      "end_time",
      "room",
      "topic",
      "status",
      "cancelled_at",
      "cancelled_reason",
    ],
    order: [["start_time", "ASC"]],
  });

  // Gắn display_status cho mỗi buổi
  const data = sessions.map((s) => {
    const plain = s.toJSON();
    plain.display_status = computeDisplayStatus(plain);
    // Flatten course lên cùng cấp class cho dễ dùng FE
    plain.course = plain.class?.course || null;
    return plain;
  });

  return data;
};

// ────────────────────────────────────────────
// 2. GET SESSION DETAIL
// ────────────────────────────────────────────

/**
 * Lấy chi tiết buổi học, bao gồm danh sách sinh viên, điểm danh, tài liệu.
 * BR_CAL_01: Kiểm tra buổi học phải thuộc lớp của teacher.
 * E2: Nếu buổi bị hủy → trả thông tin hủy, is_cancelled=true.
 *
 * @param {string} teacherId - UUID giảng viên (JWT)
 * @param {string} sessionId - UUID buổi học (URL param)
 */
export const getSessionDetail = async (teacherId, sessionId) => {
  assertUUID(teacherId, "teacherId");
  assertUUID(sessionId, "sessionId");
  console.log("a");
  
  // Lấy session kèm class → kiểm tra quyền
  const session = await ClassSession.findByPk(sessionId, {
    include: [
      {
        model: Class,
        as: "class",
        attributes: ["id", "name", "teacher_id", "course_id"],
        include: [
          {
            model: Course,
            as: "course",
            attributes: ["id", "code", "name"],
          },
        ],
      },
    ],
  });

  if (!session) {
    throw httpError("Buổi học không tồn tại.", 404, "NOT_FOUND", { sessionId });
  }

  // BR_CAL_01: Chỉ GV được phân công mới được xem
  if (session.class.teacher_id !== teacherId) {
    throw httpError(
      "Bạn không có quyền truy cập buổi học này.",
      403,
      "FORBIDDEN",
    );
  }

  const plain = session.toJSON();
  plain.display_status = computeDisplayStatus(plain);
  plain.is_cancelled = plain.status === "cancelled";

  // ──── Nếu buổi bị hủy (Exception E2) → trả thông tin hủy, không cần danh sách SV ────
  if (plain.is_cancelled) {
    plain.course = plain.class?.course || null;
    plain.students = [];
    plain.materials = [];
    plain.attendance_summary = null;
    return plain;
  }
  console.log("b");

  // ──── Buổi bình thường: lấy thêm SV enrolled, attendance, materials ────

  // 1) Danh sách SV đăng ký lớp
  const enrollments = await Enrollment.findAll({
    where: { class_id: session.class_id, status: "active" },
    include: [
      {
        model: User,
        as: "student",
        attributes: ["id", "full_name", "email", "avatar_url"],
      },
    ],
    order: [[{ model: User, as: "student" }, "full_name", "ASC"]],
  });
console.log(enrollments);
  const attendanceRecords = await AttendanceRecord.findAll({
    where: { session_id: sessionId },
    attributes: ["id", "session_id", "student_id", "status", "note", "marked_by", "marked_at"],
  });

  // Map attendance theo student_id để tra nhanh
  const attendanceMap = new Map();
  for (const ar of attendanceRecords) {
    attendanceMap.set(ar.student_id, {
      status: ar.status,
      note: ar.note,
      marked_at: ar.marked_at,
    });
  }

  console.log("c");

  // 3) Tài liệu gắn với buổi này (hoặc gắn với class mà không gắn session cụ thể)
  const materials = await Material.findAll({
    where: {
      [Op.or]: [
        { session_id: sessionId },
        { class_id: session.class_id, session_id: null },
      ],
    },
    attributes: ["id", "title", "type", "file_url", "description", "created_at"],
    order: [["created_at", "ASC"]],
  });

  // 4) Gộp danh sách SV + attendance
  const students = enrollments.map((e) => {
    const student = e.student.toJSON();
    student.attendance = attendanceMap.get(student.id) || null;
    return student;
  });
  console.log("d");

  // 5) Tổng hợp attendance
  const totalStudents = students.length;
  let present = 0,
    absent = 0,
    late = 0,
    excused = 0;
  for (const att of attendanceRecords) {
    if (att.status === "present") present++;
    else if (att.status === "absent") absent++;
    else if (att.status === "late") late++;
    else if (att.status === "excused") excused++;
  }

  plain.course = plain.class?.course || null;
  plain.students = students;
  plain.materials = materials;
  plain.attendance_summary = {
    total: totalStudents,
    present,
    absent,
    late,
    excused,
    not_taken: attendanceRecords.length === 0,
  };

  return plain;
};

// ────────────────────────────────────────────
// 3. GET TEACHER CLASSES (filter dropdown)
// ────────────────────────────────────────────

/**
 * Lấy danh sách lớp của giảng viên (dùng cho dropdown lọc lịch).
 * Chỉ trả các lớp active.
 *
 * @param {string} teacherId - UUID giảng viên (JWT)
 */
export const getTeacherClasses = async (teacherId) => {
  assertUUID(teacherId, "teacherId");

  const classes = await Class.findAll({
    where: { teacher_id: teacherId, status: "active" },
    include: [
      {
        model: Course,
        as: "course",
        required: true,
        attributes: ["id", "code", "name"],
      },
    ],
    attributes: ["id", "name", "start_date", "end_date"],
    order: [["name", "ASC"]],
  });

  return classes.map((c) => ({
    class_id: c.id,
    class_name: c.name,
    start_date: c.start_date,
    end_date: c.end_date,
    course_code: c.course?.code,
    course_name: c.course?.name,
  }));
};
