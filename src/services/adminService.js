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
    // --- UC_ADM_11: QUẢN LÝ LỚP HỌC ---
    getAllClasses: async () => {
        return await Class.findAll({
            include: [
                { model: Course, as: "course", attributes: ["name", "code"] },
                { model: User, as: "teacher", attributes: ["full_name"] },
                { 
                    model: Enrollment, 
                    as: "enrollments", 
                    attributes: ["id"]
                }
            ],
            // BỎ trường is_deleted ở đây vì Model hiện tại của bạn không có
            order: [["created_at", "DESC"]]
        });
    },

    getClassDetail: async (id) => {
        const cls = await Class.findByPk(id, {
            include: [
                { model: Course, as: "course" },
                { model: User, as: "teacher", attributes: ["id", "full_name", "email"] },
                { 
                    model: Enrollment, as: "enrollments",
                    // Sử dụng alias 'student' để khớp với định nghĩa quan hệ
                    include: [{ model: User, as: "student", attributes: ["full_name", "email"] }] 
                },
                { model: ClassSession, as: "sessions" }
            ],
        });
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");
        return cls;
    },

    createClass: async (classData) => {
        // Tạo lớp học mới với đầy đủ các trường từ Popup Figma
        return await Class.create({
            course_id: classData.course_id, 
            name: classData.name,
            semester: classData.semester,      
            max_capacity: classData.max_capacity || 40, 
            start_date: classData.start_date,
            end_date: classData.end_date,
            teacher_id: classData.teacher_id || null 
        });
    },

    updateClass: async (id, data) => {
        const cls = await Class.findByPk(id);
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");
        return await cls.update(data);
    }
};