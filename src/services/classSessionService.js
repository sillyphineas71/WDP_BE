// src/services/classSessionService.js
import { Op } from "sequelize";
import {
  sequelize,
  ClassSession,
  Class,
  User,
  Course,
} from "../models/index.js";

const httpError = (message, statusCode, code, details) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  if (details) err.details = details;
  return err;
};

const parseISODateTime = (value, field) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw httpError(
      `Invalid ${field}. Must be ISO datetime.`,
      400,
      "VALIDATION_ERROR",
      { field, value },
    );
  }
  return d;
};

const resolveStartEnd = (body) => {
  // Support:
  // - start_time/end_time ISO
  // - OR start_at/end_at ISO
  const startRaw = body.start_time ?? body.start_at;
  const endRaw = body.end_time ?? body.end_at;

  if (!startRaw || !endRaw)
    throw httpError("Thiếu start_time/end_time", 400, "VALIDATION_ERROR");

  const startAt = parseISODateTime(startRaw, "start_time");
  const endAt = parseISODateTime(endRaw, "end_time");

  if (endAt <= startAt)
    throw httpError(
      "End time must be after start time.",
      400,
      "VALIDATION_ERROR",
    );

  return { startAt, endAt };
};

const buildOverlapWhere = (startAt, endAt) => ({
  start_time: { [Op.lt]: endAt },
  end_time: { [Op.gt]: startAt },
});

const assertUUID = (id, field) => {
  // UUID v4 basic check
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    throw httpError(
      `Invalid ${field}. Must be UUID.`,
      400,
      "VALIDATION_ERROR",
      { field, value: id },
    );
  }
};

const getUserName = (u) => u?.full_name || u?.email || "[Giảng viên]";

/**
 * Cross-check 3 conflicts:
 * 1) Teacher conflict: based on Class.teacher_id (because ClassSession has no teacher_id)
 * 2) Room conflict: same room + overlap
 * 3) Class conflict: same class_id + overlap
 */
const checkConflictsOrThrow = async ({
  class_id,
  teacher_id,
  room,
  startAt,
  endAt,
  excludeSessionId,
  t,
}) => {
  const overlapWhere = buildOverlapWhere(startAt, endAt);

  const baseSessionWhere = {
    status: "scheduled",
    ...overlapWhere,
    ...(excludeSessionId ? { id: { [Op.ne]: excludeSessionId } } : {}),
  };

  // ✅ lock chỉ trên bảng ClassSession để tránh lỗi join
  const lockSession = { level: t.LOCK.UPDATE, of: ClassSession };

  // ===== 1) Teacher conflict (INNER JOIN OK) =====
  if (teacher_id) {
    const teacherConflict = await ClassSession.findOne({
      where: baseSessionWhere,
      include: [
        {
          model: Class,
          as: "class",
          required: true, // ✅ INNER JOIN
          where: { teacher_id },
        },
      ],
      transaction: t,
      lock: lockSession,
    });

    if (teacherConflict) {
      const teacher = await User.findByPk(teacher_id, { transaction: t });
      throw httpError(
        `Lỗi: Giảng viên ${getUserName(teacher)} đã có lịch dạy trong khoảng thời gian này.`,
        409,
        "SCHED_CONFLICT_TEACHER",
        { conflict_session_id: teacherConflict.id },
      );
    }
  }

  // ===== 2) Room conflict (❗BỎ include để không LEFT JOIN) =====
  if (room) {
    const roomConflict = await ClassSession.findOne({
      where: { ...baseSessionWhere, room },
      transaction: t,
      lock: lockSession, // ✅ lock only ClassSession
    });

    if (roomConflict) {
      throw httpError(
        `Lỗi: Phòng ${room} đang được sử dụng trong khoảng thời gian này.`,
        409,
        "SCHED_CONFLICT_ROOM",
        { conflict_session_id: roomConflict.id },
      );
    }
  }

  // ===== 3) Class conflict (không cần JOIN) =====
  const classConflict = await ClassSession.findOne({
    where: { ...baseSessionWhere, class_id },
    transaction: t,
    lock: lockSession,
  });

  if (classConflict) {
    throw httpError(
      "Lỗi: Lớp đã có lịch học môn khác vào khoảng thời gian này.",
      409,
      "SCHED_CONFLICT_CLASS",
      { conflict_session_id: classConflict.id },
    );
  }
};

// ========================= UC_ADM_14 =========================

// CREATE
export const createManualClassSession = async (adminId, body) => {
  const { class_id, room, note, topic } = body;
  if (!class_id)
    throw httpError("class_id is required", 400, "VALIDATION_ERROR");
  assertUUID(class_id, "class_id");

  if (!room || String(room).trim() === "")
    throw httpError("room is required", 400, "VALIDATION_ERROR");

  const { startAt, endAt } = resolveStartEnd(body);

  return sequelize.transaction(async (t) => {
    const cls = await Class.findByPk(class_id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!cls)
      throw httpError("Lớp học không tồn tại", 404, "NOT_FOUND", { class_id });

    const teacher_id = cls.teacher_id;
    if (!teacher_id)
      throw httpError("Lớp chưa có teacher_id", 400, "VALIDATION_ERROR");

    // teacher must exist
    const teacher = await User.findByPk(teacher_id, { transaction: t });
    if (!teacher)
      throw httpError("Giảng viên của lớp không tồn tại", 404, "NOT_FOUND", {
        teacher_id,
      });

    await checkConflictsOrThrow({
      class_id,
      teacher_id,
      room: String(room).trim(),
      startAt,
      endAt,
      excludeSessionId: null,
      t,
    });

    const created = await ClassSession.create(
      {
        class_id,
        start_time: startAt,
        end_time: endAt,
        room: String(room).trim(),
        topic: topic ?? note ?? null,
        status: "scheduled",
      },
      { transaction: t },
    );

    return created;
  });
};

// UPDATE
export const updateManualClassSession = async (adminId, sessionId, body) => {
  if (!sessionId)
    throw httpError("sessionId is required", 400, "VALIDATION_ERROR");
  assertUUID(sessionId, "sessionId");

  const { startAt, endAt } = resolveStartEnd(body);

  return sequelize.transaction(async (t) => {
    const session = await ClassSession.findByPk(sessionId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!session)
      throw httpError("Buổi học không tồn tại", 404, "NOT_FOUND", {
        sessionId,
      });

    if (session.status === "cancelled")
      throw httpError("Không thể sửa buổi học đã hủy.", 409, "INVALID_STATE");
    if (session.status === "done")
      throw httpError(
        "Không thể sửa buổi học đã hoàn thành.",
        409,
        "INVALID_STATE",
      );

    const class_id = body.class_id ?? session.class_id;
    assertUUID(class_id, "class_id");

    const cls = await Class.findByPk(class_id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!cls)
      throw httpError("Lớp học không tồn tại", 404, "NOT_FOUND", { class_id });

    const teacher_id = cls.teacher_id;
    if (!teacher_id)
      throw httpError("Lớp chưa có teacher_id", 400, "VALIDATION_ERROR");

    const room = body.room ?? session.room;
    if (!room || String(room).trim() === "")
      throw httpError("room is required", 400, "VALIDATION_ERROR");

    await checkConflictsOrThrow({
      class_id,
      teacher_id,
      room: String(room).trim(),
      startAt,
      endAt,
      excludeSessionId: sessionId,
      t,
    });

    await session.update(
      {
        class_id,
        start_time: startAt,
        end_time: endAt,
        room: String(room).trim(),
        topic: body.topic ?? body.note ?? session.topic ?? null,
      },
      { transaction: t },
    );

    return session;
  });
};

// CANCEL
export const cancelManualClassSession = async (adminId, sessionId, reason) => {
  if (!sessionId)
    throw httpError("sessionId is required", 400, "VALIDATION_ERROR");
  assertUUID(sessionId, "sessionId");

  return sequelize.transaction(async (t) => {
    const session = await ClassSession.findByPk(sessionId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!session)
      throw httpError("Buổi học không tồn tại", 404, "NOT_FOUND", {
        sessionId,
      });

    if (session.status === "cancelled") return session; // idempotent

    await session.update(
      {
        status: "cancelled",
        // lưu reason vào topic (vì model không có cancel_reason)
        topic: reason
          ? `${session.topic ? session.topic + " | " : ""}Cancel: ${reason}`
          : session.topic,
      },
      { transaction: t },
    );

    return session;
  });
};

const parseISO = (value, field) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw httpError(
      `Invalid ${field}. Must be ISO datetime.`,
      400,
      "VALIDATION_ERROR",
      { field, value },
    );
  }
  return d;
};

const getCourseCodeField = () => {
  // cố gắng bắt tên field mã môn phổ biến
  const attrs = Course.getAttributes?.() || {};
  if (attrs.code) return "code";
  if (attrs.course_code) return "course_code";
  if (attrs.courseCode) return "courseCode";
  throw httpError(
    "Course model thiếu field mã môn (code/course_code).",
    500,
    "CONFIG_ERROR",
  );
};

export const listClassSessions = async (query) => {
  const {
    class_id,
    teacher_id,
    course_code,
    status,
    from,
    to,
    group_by,
    page = 1,
    limit = 20,
  } = query;

  // validate
  if (class_id) assertUUID(class_id, "class_id");
  if (teacher_id) assertUUID(teacher_id, "teacher_id");
  if (status && !["scheduled", "cancelled", "done"].includes(status)) {
    throw httpError(
      "Invalid status. Use scheduled/cancelled/done.",
      400,
      "VALIDATION_ERROR",
    );
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const sessionWhere = {};
  if (status) sessionWhere.status = status;

  if (from) sessionWhere.start_time = { [Op.gte]: parseISO(from, "from") };
  if (to) sessionWhere.end_time = { [Op.lte]: parseISO(to, "to") };

  if (class_id) sessionWhere.class_id = class_id;

  const classWhere = {};
  if (teacher_id) classWhere.teacher_id = teacher_id;

  const courseCodeField = getCourseCodeField();

  const include = [
    {
      model: Class,
      as: "class",
      required: true, // buổi học luôn phải thuộc 1 class
      where: Object.keys(classWhere).length ? classWhere : undefined,
      include: [
        {
          model: Course,
          as: "course",
          required: !!course_code,
          where: course_code ? { [courseCodeField]: course_code } : undefined,
          attributes: ["id", courseCodeField, "name"],
        },
        {
          model: User,
          as: "teacher",
          required: false,
          attributes: ["id", "full_name", "email"],
        },
      ],
      attributes: [
        "id",
        "course_id",
        "teacher_id",
        "name",
        "start_date",
        "end_date",
        "status",
      ],
    },
  ];

  const result = await ClassSession.findAndCountAll({
    where: sessionWhere,
    include,
    order: [["start_time", "ASC"]],
    limit: limitNum,
    offset,
  });

  const rows = result.rows || [];
  const total = result.count || 0;
  const totalPages = Math.ceil(total / limitNum);

  // nếu không group_by => trả list bình thường
  if (!group_by) {
    return {
      meta: { page: pageNum, limit: limitNum, total, totalPages },
      data: rows,
    };
  }

  // group_by: class | course | teacher
  if (!["class", "course", "teacher"].includes(group_by)) {
    throw httpError(
      "Invalid group_by. Use class/course/teacher.",
      400,
      "VALIDATION_ERROR",
    );
  }

  const groupedMap = new Map();

  for (const s of rows) {
    const cls = s.class;
    const course = cls?.course;
    const teacher = cls?.teacher;

    let key;
    if (group_by === "class") key = cls?.id;
    if (group_by === "course") key = course?.[courseCodeField] || course?.id;
    if (group_by === "teacher") key = teacher?.id || cls?.teacher_id;

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        key,
        class: group_by === "class" ? cls : undefined,
        course: group_by === "course" ? course : undefined,
        teacher: group_by === "teacher" ? teacher : undefined,
        sessions: [],
      });
    }
    groupedMap.get(key).sessions.push(s);
  }

  return {
    meta: { page: pageNum, limit: limitNum, total, totalPages, group_by },
    data: Array.from(groupedMap.values()),
  };
};
