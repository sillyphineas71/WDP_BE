import { Course } from "../models/Course.js";
import { Class } from "../models/Class.js";
import { User } from "../models/User.js";
import { Enrollment } from "../models/Enrollment.js";
import { ClassSession } from "../models/ClassSession.js";
import { ConflictError, NotFoundError } from "../errors/AppError.js";

export const adminService = {
    // --- UC_ADM_10: QUẢN LÝ KHÓA HỌC ---
    getAllCourses: async () => {
        return await Course.findAll({ order: [["created_at", "DESC"]] });
    },

    createCourse: async (data) => {
        const existing = await Course.findOne({ where: { code: data.code } });
        if (existing) throw new ConflictError("Mã khóa học đã tồn tại");
        return await Course.create(data);
    },

    updateCourse: async (id, data) => {
        const course = await Course.findByPk(id);
        if (!course) throw new NotFoundError("Khóa học không tồn tại");
        return await course.update(data);
    },

    deleteCourse: async (id) => {
        const course = await Course.findByPk(id);
        if (!course) throw new NotFoundError("Khóa học không tồn tại");
        return await course.destroy();
    },

    // --- UC_ADM_11: QUẢN LÝ LỚP HỌC ---
    getAllClasses: async () => {
        return await Class.findAll({
            include: [
                { model: Course, as: "course", attributes: ["name", "code"] },
                { model: User, as: "teacher", attributes: ["full_name"] },
                { model: Enrollment, as: "enrollments", attributes: ["id"] }
            ],
            order: [["created_at", "DESC"]]
        });
    },

    // Quan trọng: Lấy đủ data cho 4 Tab trong Figma
    getClassDetail: async (id) => {
        const cls = await Class.findByPk(id, {
            include: [
                { model: Course, as: "course" },
                { model: User, as: "teacher", attributes: ["id", "full_name", "email"] },
                { 
                    model: Enrollment, as: "enrollments",
                    include: [{ model: User, as: "user", attributes: ["full_name", "email"] }] 
                },
                { model: ClassSession, as: "sessions" }
            ],
        });
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");
        return cls;
    },
    // UC_ADM_11: Thêm lớp học mới
    createClass: async (classData) => {
        const newClass = await Class.create({
            course_id: classData.course_id, 
            teacher_id: classData.teacher_id, 
            name: classData.name,
            start_date: classData.start_date,
            end_date: classData.end_date,
            max_capacity: classData.max_capacity || 40,
            status: 'active'
        });
        return newClass;
    },

    updateClass: async (id, data) => {
        const cls = await Class.findByPk(id);
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");
        return await cls.update(data);
    }
};