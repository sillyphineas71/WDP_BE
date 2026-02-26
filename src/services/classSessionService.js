import { sequelize, ClassSession, Class, User } from "../models/index.js";
import { Op } from "sequelize";

const httpError = (message, statusCode, code, details) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  if (details) err.details = details;
  return err;
};

// Parse ISO start/end and compute duration
const resolveStartEnd = (body) => {
  const startRaw = body.start_time ?? body.start_at;
  const endRaw = body.end_time ?? body.end_at;

  if (!startRaw || !endRaw)
    throw httpError("Thiếu start_time/end_time", 400, "VALIDATION_ERROR");

  const startAt = new Date(startRaw);
  const endAt = new Date(endRaw);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw httpError(
      "start_time/end_time phải là ISO datetime hợp lệ",
      400,
      "VALIDATION_ERROR",
    );
  }
  if (endAt <= startAt)
    throw httpError(
      "End time must be after start time",
      400,
      "VALIDATION_ERROR",
    );

  const durationMinutes = Math.ceil((endAt - startAt) / 60000);
  return { startAt, endAt, durationMinutes };
};

// Overlap: existingStart < newEnd AND existingEnd > newStart
const buildOverlapWhere = (newStart, newEnd) => {
  const existingEndExpr = sequelize.literal(
    `"ClassSession"."scheduled_date" + ("ClassSession"."duration_minutes"::text || ' minutes')::interval`,
  );

  return {
    scheduled_date: { [Op.lt]: newEnd },
    [Op.and]: sequelize.where(existingEndExpr, { [Op.gt]: newStart }),
  };
};

const nextSessionNumber = async (class_id, t) => {
  const maxNo = await ClassSession.max("session_number", {
    where: { class_id },
    transaction: t,
  });
  return (maxNo || 0) + 1;
};

// ==================== UC_ADM_14 ====================

// CREATE
export const createManualClassSession = async (adminId, body) => {
  const { class_id } = body;
  if (!class_id)
    throw httpError("class_id is required", 400, "VALIDATION_ERROR");

  const { startAt, endAt, durationMinutes } = resolveStartEnd(body);
  const overlapWhere = buildOverlapWhere(startAt, endAt);

  return sequelize.transaction(async (t) => {
    const cls = await Class.findByPk(class_id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!cls) throw httpError("Lớp học không tồn tại", 404, "NOT_FOUND");

    // Teacher: default theo lớp
    const teacherId = body.teacher_id ?? cls.teacher_id;
    if (!teacherId)
      throw httpError("Lớp chưa có teacher_id", 400, "VALIDATION_ERROR");

    const teacher = await User.findByPk(teacherId, { transaction: t });
    if (!teacher) throw httpError("Giảng viên không tồn tại", 404, "NOT_FOUND");

    // 1) Conflict Teacher: check any session that belongs to classes of this teacher
    const teacherConflict = await ClassSession.findOne({
      where: overlapWhere,
      include: [
        {
          model: Class,
          as: "class",
          required: true,
          where: { teacher_id: teacherId },
        },
      ],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (teacherConflict) {
      throw httpError(
        "Lỗi: Giảng viên đã có lịch dạy trong khoảng thời gian này.",
        409,
        "SCHED_CONFLICT_TEACHER",
        {
          conflict_session_id: teacherConflict.id,
        },
      );
    }

    // 2) Conflict Class: same class_id
    const classConflict = await ClassSession.findOne({
      where: { ...overlapWhere, class_id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (classConflict) {
      throw httpError(
        "Lỗi: Lớp đã có lịch học môn khác vào khoảng thời gian này.",
        409,
        "SCHED_CONFLICT_CLASS",
        {
          conflict_session_id: classConflict.id,
        },
      );
    }

    // 3) Conflict Room: chỉ làm được nếu DB có cột room trong ClassSession.
    // Nhưng log của bạn hiện tại chưa thấy room => nếu bạn có thật sự cột room thì bật đoạn dưới.
    if ("room" in ClassSession.getAttributes()) {
      if (!body.room)
        throw httpError("room is required", 400, "VALIDATION_ERROR");

      const roomConflict = await ClassSession.findOne({
        where: { ...overlapWhere, room: body.room },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (roomConflict) {
        throw httpError(
          "Lỗi: Phòng đang được sử dụng trong khoảng thời gian này.",
          409,
          "SCHED_CONFLICT_ROOM",
          {
            conflict_session_id: roomConflict.id,
          },
        );
      }
    }

    const session_number =
      "session_number" in ClassSession.getAttributes()
        ? await nextSessionNumber(class_id, t)
        : undefined;

    const created = await ClassSession.create(
      {
        class_id,
        scheduled_date: startAt,
        duration_minutes: durationMinutes,
        ...(session_number !== undefined ? { session_number } : {}),
        title: body.title ?? body.note ?? "Buổi học thủ công",
        description: body.note ?? null,
        ...("room" in ClassSession.getAttributes()
          ? { room: body.room ?? null }
          : {}),
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

  const { startAt, endAt, durationMinutes } = resolveStartEnd(body);
  const overlapWhere = buildOverlapWhere(startAt, endAt);

  return sequelize.transaction(async (t) => {
    const session = await ClassSession.findByPk(sessionId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!session) throw httpError("Buổi học không tồn tại", 404, "NOT_FOUND");

    const class_id = body.class_id ?? session.class_id;

    const cls = await Class.findByPk(class_id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!cls) throw httpError("Lớp học không tồn tại", 404, "NOT_FOUND");

    const teacherId = body.teacher_id ?? cls.teacher_id;
    if (!teacherId)
      throw httpError("Lớp chưa có teacher_id", 400, "VALIDATION_ERROR");

    // teacher conflict exclude this session
    const teacherConflict = await ClassSession.findOne({
      where: { ...overlapWhere, id: { [Op.ne]: sessionId } },
      include: [
        {
          model: Class,
          as: "class",
          required: true,
          where: { teacher_id: teacherId },
        },
      ],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (teacherConflict) {
      throw httpError(
        "Lỗi: Giảng viên đã có lịch dạy trong khoảng thời gian này.",
        409,
        "SCHED_CONFLICT_TEACHER",
        {
          conflict_session_id: teacherConflict.id,
        },
      );
    }

    const classConflict = await ClassSession.findOne({
      where: { ...overlapWhere, class_id, id: { [Op.ne]: sessionId } },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (classConflict) {
      throw httpError(
        "Lỗi: Lớp đã có lịch học môn khác vào khoảng thời gian này.",
        409,
        "SCHED_CONFLICT_CLASS",
        {
          conflict_session_id: classConflict.id,
        },
      );
    }

    if ("room" in ClassSession.getAttributes()) {
      const room = body.room ?? session.room;
      if (!room) throw httpError("room is required", 400, "VALIDATION_ERROR");

      const roomConflict = await ClassSession.findOne({
        where: { ...overlapWhere, room, id: { [Op.ne]: sessionId } },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (roomConflict) {
        throw httpError(
          "Lỗi: Phòng đang được sử dụng trong khoảng thời gian này.",
          409,
          "SCHED_CONFLICT_ROOM",
          {
            conflict_session_id: roomConflict.id,
          },
        );
      }
    }

    await session.update(
      {
        class_id,
        scheduled_date: startAt,
        duration_minutes: durationMinutes,
        title: body.title ?? session.title,
        description: body.note ?? body.description ?? session.description,
        ...("room" in ClassSession.getAttributes()
          ? { room: body.room ?? session.room }
          : {}),
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

  return sequelize.transaction(async (t) => {
    const session = await ClassSession.findByPk(sessionId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!session) throw httpError("Buổi học không tồn tại", 404, "NOT_FOUND");

    // Nếu model có status thì set cancelled; nếu không có status thì bạn cần soft-delete hoặc thêm cột status
    if (!("status" in ClassSession.getAttributes())) {
      throw httpError(
        "ClassSession chưa có cột status để hủy buổi học. Hãy thêm status hoặc dùng deleted_at.",
        500,
        "CONFIG_ERROR",
      );
    }

    if (session.status === "cancelled") return session;

    await session.update({ status: "cancelled" }, { transaction: t });

    // nếu có cột description, append reason
    if ("description" in ClassSession.getAttributes() && reason) {
      const old = session.description ? String(session.description) : "";
      await session.update(
        {
          description: old ? `${old} | Cancel: ${reason}` : `Cancel: ${reason}`,
        },
        { transaction: t },
      );
    }

    return session;
  });
};
