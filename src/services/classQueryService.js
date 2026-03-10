// src/services/classQueryService.js
import { Op } from "sequelize";
import { Class, Course, User } from "../models/index.js";

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
    throw httpError(
      `Invalid ${field}. Must be UUID.`,
      400,
      "VALIDATION_ERROR",
      { field, value: id },
    );
  }
};

export const listClassesWithCourse = async (query) => {
  const {
    status,
    teacher_id,
    course_id,
    course_code,
    q,
    page = 1,
    limit = 20,
  } = query;

  // validate
  if (status && !["active", "closed"].includes(status)) {
    throw httpError(
      "Invalid status. Use active/closed.",
      400,
      "VALIDATION_ERROR",
    );
  }
  if (teacher_id) assertUUID(teacher_id, "teacher_id");
  if (course_id) assertUUID(course_id, "course_id");

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  // where for Class
  const classWhere = {};
  if (status) classWhere.status = status;
  if (teacher_id) classWhere.teacher_id = teacher_id;
  if (course_id) classWhere.course_id = course_id;

  // where for Course
  const courseWhere = { is_deleted: false };
  if (course_code) courseWhere.code = course_code;

  // search q (class.name OR course.code/name OR teacher.full_name/email)
  const keyword = q && String(q).trim() ? `%${String(q).trim()}%` : null;

  // Postgres iLike; nếu DB bạn không phải postgres => đổi Op.iLike -> Op.like
  const likeOp = Op.iLike;

  // Nếu có q: tìm theo class.name (đơn giản)
  if (keyword) {
    classWhere.name = { [likeOp]: keyword };

    // Đồng thời cũng filter Course theo q
    courseWhere[Op.or] = [
      { code: { [likeOp]: keyword } },
      { name: { [likeOp]: keyword } },
    ];
  }

  const result = await Class.findAndCountAll({
    where: classWhere,
    include: [
      {
        model: Course,
        as: "course",
        required: true,
        where: courseWhere,
        attributes: [
          "id",
          "code",
          "name",
          "description",
          "expected_sessions",
          "status",
          "created_at",
        ],
      },
      {
        model: User,
        as: "teacher",
        required: true, // class luôn có teacher_id
        // Nếu muốn search teacher theo q thì mở đoạn where này
        ...(keyword
          ? {
              where: {
                [Op.or]: [
                  { full_name: { [likeOp]: keyword } },
                  { email: { [likeOp]: keyword } },
                ],
              },
            }
          : {}),
        attributes: [
          "id",
          "full_name",
          "email",
          "phone",
          "avatar_url",
          "status",
        ],
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
      "created_at",
    ],
    order: [["created_at", "DESC"]],
    limit: limitNum,
    offset,
  });

  const total = result.count || 0;
  const totalPages = Math.ceil(total / limitNum);

  return {
    meta: { page: pageNum, limit: limitNum, total, totalPages },
    data: result.rows,
  };
};
