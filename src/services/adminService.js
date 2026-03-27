import { Course } from "../models/Course.js";
import { Class } from "../models/Class.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Enrollment } from "../models/Enrollment.js";
import { ClassSession } from "../models/ClassSession.js";
import { Submission } from "../models/Submission.js";
import { Grade } from "../models/Grade.js";
import { Assessment } from "../models/Assessment.js";
import { Material } from "../models/Material.js";
import { Sequelize, QueryTypes } from "sequelize";
import { ConflictError, NotFoundError } from "../errors/AppError.js";

export const adminService = {
    // --- UC_ADM_10: QUẢN LÝ KHÓA HỌC ---
    getAllCourses: async ({ page = 1, limit = 20, q = "", status = "all" }) => {
        const offset = (page - 1) * limit;
        const where = { is_deleted: false };
        
        if (q) {
            where[Sequelize.Op.or] = [
                { name: { [Sequelize.Op.iLike]: `%${q}%` } },
                { code: { [Sequelize.Op.iLike]: `%${q}%` } }
            ];
        }
        
        if (status && status !== "all") {
            where.status = status;
        }

        const { count, rows } = await Course.findAndCountAll({
            where,
            order: [["created_at", "DESC"]],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        return {
            data: rows,
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(count / limit)
        };
    },

    createCourse: async (data) => {
        if (!data.code || !/^[A-Za-z0-9_-]+$/.test(data.code)) {
            throw new ConflictError("Mã môn học không hợp lệ (không chứa khoảng trắng hoặc ký tự đặc biệt ngoài _ và -)");
        }
        if (!data.expected_sessions) {
            throw new ConflictError("Số buổi học/Tín chỉ là bắt buộc");
        }

        // Case insensitive unique check
        const existing = await Course.findOne({
            where: { code: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('code')), data.code.toLowerCase()) }
        });
        if (existing) throw new ConflictError("Mã khóa học đã tồn tại");
        return await Course.create(data);
    },

    updateCourse: async (id, data) => {
        const course = await Course.findByPk(id);
        if (!course) throw new NotFoundError("Khóa học không tồn tại");

        if (data.code) {
            if (!/^[A-Za-z0-9_-]+$/.test(data.code)) {
                throw new ConflictError("Mã môn học không hợp lệ");
            }
            const existing = await Course.findOne({
                where: {
                    code: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('code')), data.code.toLowerCase()),
                    id: { [Sequelize.Op.ne]: id }
                }
            });
            if (existing) throw new ConflictError("Mã khóa học đã tồn tại");
        }

        return await course.update(data);
    },

    deleteCourse: async (id) => {
        const course = await Course.findByPk(id);
        if (!course) throw new NotFoundError("Khóa học không tồn tại");

        const linkedClasses = await Class.count({ where: { course_id: id } });
        if (linkedClasses > 0) {
            throw new ConflictError("Không thể xóa khóa học đã có lớp học gắn liền");
        }

        // Soft delete
        return await course.update({ is_deleted: true });
    },

    validateCourseImport: async (rows) => {
        const validRows = [];
        const invalidRows = [];

        // Lấy tất cả mã môn hiện có (uppercase để so sánh)
        const courses = await Course.findAll({ attributes: ["code"] });
        const existingCodes = courses.map(c => c.code.toUpperCase());

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const code = String(row["Mã môn"] || "").trim();
            const name = String(row["Tên môn"] || "").trim();
            const expected_sessions = row["Số tiết"];
            const description = String(row["Mô tả"] || "").trim();

            if (!code || !name) {
                invalidRows.push({ rowNumber: i + 1, code, name, reason: "Thiếu trường dữ liệu bắt buộc (Mã môn, Tên môn)." });
                continue;
            }

            if (!/^[A-Za-z0-9_-]+$/.test(code)) {
                invalidRows.push({ rowNumber: i + 1, code, name, reason: "Mã môn học không hợp lệ (không chứa ký tự đặc biệt)." });
                continue;
            }

            if (expected_sessions === undefined || expected_sessions === null || isNaN(Number(expected_sessions)) || Number(expected_sessions) <= 0) {
                invalidRows.push({ rowNumber: i + 1, code, name, reason: "Số tiết phải là số nguyên dương." });
                continue;
            }

            if (existingCodes.includes(code.toUpperCase())) {
                invalidRows.push({ rowNumber: i + 1, code, name, reason: "Mã môn học đã tồn tại trong hệ thống." });
                continue;
            }

            if (validRows.some(vr => vr.code.toUpperCase() === code.toUpperCase())) {
                invalidRows.push({ rowNumber: i + 1, code, name, reason: "Mã môn học bị trùng lặp bên trong file Import." });
                continue;
            }

            validRows.push({ code, name, expected_sessions: Number(expected_sessions), description });
        }

        return { validRows, invalidRows };
    },

    confirmCourseImport: async (validRows) => {
        let successCount = 0;
        const failures = [];

        for (const row of validRows) {
            try {
                await Course.create({
                    code: row.code,
                    name: row.name,
                    expected_sessions: row.expected_sessions,
                    description: row.description,
                    status: "active"
                });
                successCount++;
            } catch (error) {
                failures.push({ code: row.code, reason: error.message });
            }
        }
        return { successCount, failures };
    },

    // --- UC TEACHER REPOSITORIES ---
    getAllTeachers: async () => {
        // Find all active teachers (Role: teacher, status: active)
        const teachers = await User.findAll({
            where: { status: "active" },
            attributes: ["id", "full_name", "email", "phone"],
            include: [{
                model: Role,
                as: "role",
                where: { code: "TEACHER" }
            }]
        });
        return teachers;
    },

    // --- UC_ADM_11: QUẢN LÝ LỚP HỌC ---
    getAllClasses: async ({ page = 1, limit = 20, q = "", statusFilter = "all" }) => {
        const offset = (page - 1) * limit;
        const where = {};
        
        if (q) {
            where[Sequelize.Op.or] = [
                { name: { [Sequelize.Op.iLike]: `%${q}%` } },
                { '$course.name$': { [Sequelize.Op.iLike]: `%${q}%` } }
            ];
        }
        
        if (statusFilter && statusFilter !== "all") {
            where.status = statusFilter;
        }

        const { count, rows } = await Class.findAndCountAll({
            where,
            attributes: {
                include: [
                    [
                        Sequelize.literal(`(
                            SELECT COUNT(*)
                            FROM enrollments AS e
                            WHERE e.class_id = "Class".id
                        )`),
                        'enrollmentCount'
                    ]
                ]
            },
            include: [
                { model: Course, as: "course", attributes: ["name", "code"] },
                { model: User, as: "teacher", attributes: ["full_name"] }
            ],
            order: [["created_at", "DESC"]],
            limit: parseInt(limit),
            offset: parseInt(offset),
            distinct: true
        });

        return {
            data: rows,
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(count / limit)
        };
    },

    getClassDetail: async (id) => {
        const cls = await Class.findByPk(id, {
            include: [
                { model: Course, as: "course" },
                { model: User, as: "teacher", attributes: ["id", "full_name", "email"] },
                {
                    model: Enrollment, as: "enrollments",
                    include: [{ model: User, as: "student", attributes: ["id", "full_name", "email"] }]
                },
                {
                    model: ClassSession,
                    as: "sessions",
                    where: { status: { [Sequelize.Op.ne]: "cancelled" } },
                    required: false 
                }
            ],
        });
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");

        return cls;
    },

    createClass: async (classData) => {
        if (!classData.name) throw new ConflictError("Tên lớp là bắt buộc");
        if (new Date(classData.end_date) <= new Date(classData.start_date)) {
            throw new ConflictError("Ngày kết thúc phải diễn ra sau Ngày bắt đầu. Vui lòng chọn lại.");
        }

        const existing = await Class.findOne({
            where: {
                name: classData.name,
                course_id: classData.course_id,
                semester: classData.semester
            }
        });
        if (existing) throw new ConflictError(`Lớp ${classData.name} đã tồn tại cho môn học này trong học kỳ hiện tại.`);

        let initialStatus = "active";
        if (new Date(classData.start_date) > new Date()) {
            initialStatus = "upcoming";
        }

        // Tạo lớp học mới với đầy đủ các trường từ Popup Figma
        return await Class.create({
            course_id: classData.course_id,
            name: classData.name,
            semester: classData.semester,
            max_capacity: classData.max_capacity || 30,
            start_date: classData.start_date,
            end_date: classData.end_date,
            teacher_id: classData.teacher_id || null,
            status: initialStatus
        });
    },

    updateClass: async (id, data) => {
        const cls = await Class.findByPk(id);
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");

        if (data.start_date || data.end_date) {
            const start = data.start_date || cls.start_date;
            const end = data.end_date || cls.end_date;
            if (new Date(end) <= new Date(start)) {
                throw new ConflictError("Ngày kết thúc phải diễn ra sau Ngày bắt đầu. Vui lòng chọn lại.");
            }
        }

        if (data.name || data.semester || data.course_id) {
            const checkName = data.name || cls.name;
            const checkSemester = data.semester || cls.semester;
            const checkCourse = data.course_id || cls.course_id;

            const existing = await Class.findOne({
                where: {
                    name: checkName,
                    semester: checkSemester,
                    course_id: checkCourse,
                    id: { [Sequelize.Op.ne]: id }
                }
            });
            if (existing) throw new ConflictError(`Lớp ${checkName} đã tồn tại cho môn học này trong học kỳ hiện tại.`);
        }

        return await cls.update(data);
    },

    validateClassImport: async (rows) => {
        const validRows = [];
        const invalidRows = [];
        const classUniquenessCheck = new Set(); // courseCode_semester_className

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const { course_code, semester, name, start_date, end_date, max_capacity, teacher_email } = row;

            if (!course_code || !semester || !name || !start_date || !end_date) {
                invalidRows.push({ ...row, rowNumber: i + 1, reason: "Thiếu trường bắt buộc (Mã môn, Học kỳ, Tên lớp, Ngày BĐ, Kết thúc)" });
                continue;
            }

            // Check Dates
            const start = new Date(start_date);
            const end = new Date(end_date);
            if (isNaN(start) || isNaN(end) || end <= start) {
                invalidRows.push({ ...row, rowNumber: i + 1, reason: "Ngày kết thúc phải lớn hơn ngày bắt đầu và đúng định dạng." });
                continue;
            }

            // Past Date check
            const todayNoon = new Date();
            todayNoon.setHours(0, 0, 0, 0);
            if (start < todayNoon) {
                invalidRows.push({ ...row, rowNumber: i + 1, reason: "Ngày bắt đầu không thể ở quá khứ." });
                continue;
            }

            // Academic Year Validation
            const yearMatch = String(semester || "").match(/(\d{4})-(\d{4})/);
            if (yearMatch) {
                const startYear = parseInt(yearMatch[1]);
                const endYear = parseInt(yearMatch[2]);
                if (start.getFullYear() < startYear) {
                    invalidRows.push({ ...row, rowNumber: i + 1, reason: `Ngày bắt đầu (${start.getFullYear()}) phải từ năm ${startYear} trở đi.` });
                    continue;
                }
                if (end.getFullYear() > endYear) {
                    invalidRows.push({ ...row, rowNumber: i + 1, reason: `Ngày kết thúc (${end.getFullYear()}) phải muộn nhất năm ${endYear}.` });
                    continue;
                }
            }

            // Check Course exists (Case-insensitive)
            const course = await Course.findOne({
                where: Sequelize.where(
                    Sequelize.fn('LOWER', Sequelize.col('code')),
                    course_code.toLowerCase()
                )
            });
            if (!course) {
                invalidRows.push({ ...row, rowNumber: i + 1, reason: `Mã môn gốc "${course_code}" không tồn tại trên hệ thống.` });
                continue;
            }

            // Check Unique Class inside DB (Case-insensitive)
            const existingClassInDB = await Class.findOne({
                where: {
                    course_id: course.id,
                    [Sequelize.Op.and]: [
                        Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('name')), name.toLowerCase()),
                        Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('semester')), semester.toLowerCase())
                    ]
                }
            });

            if (existingClassInDB) {
                invalidRows.push({ ...row, rowNumber: i + 1, reason: `Lớp "${name}" đã tồn tại trong học kỳ "${semester}" của môn "${course_code}".` });
                continue;
            }

            // Check unique in file
            const classKey = `${course_code}_${semester}_${name}`;
            if (classUniquenessCheck.has(classKey)) {
                invalidRows.push({ ...row, rowNumber: i + 1, reason: `Bị trùng lặp thông tin lớp "${name}" ngay trong file Excel này.` });
                continue;
            }
            classUniquenessCheck.add(classKey);

            // Check Teacher Emal
            let teacherId = null;
            let teacherName = "";
            if (teacher_email) {
                const teacherCount = await User.findOne({
                    where: { email: String(teacher_email).toLowerCase(), status: "active" },
                    include: [{ model: Role, as: "role", where: { code: "TEACHER" } }]
                });

                if (!teacherCount) {
                    invalidRows.push({ ...row, rowNumber: i + 1, reason: `Không tìm thấy tài khoản Giáo viên có email là "${teacher_email}".` });
                    continue;
                }
                teacherId = teacherCount.id;
                teacherName = teacherCount.full_name;
            }

            validRows.push({
                course_id: course.id,
                course_code,
                name,
                semester,
                start_date: start_date,
                end_date: end_date,
                max_capacity: Number(max_capacity) || 30,
                teacher_id: teacherId,
                teacher_email: teacher_email || "",
                teacher_name: teacherName,
                rowNumber: i + 1
            });
        }

        return { validRows, invalidRows };
    },

    confirmClassImport: async (validRows) => {
        let successCount = 0;
        const failures = [];

        for (const row of validRows) {
            try {
                let initialStatus = "active";
                if (new Date(row.start_date) > new Date()) initialStatus = "upcoming";

                await Class.create({
                    course_id: row.course_id,
                    name: row.name,
                    semester: row.semester,
                    max_capacity: row.max_capacity,
                    start_date: row.start_date,
                    end_date: row.end_date,
                    teacher_id: row.teacher_id,
                    status: initialStatus
                });
                successCount++;
            } catch (error) {
                failures.push({ name: row.name, reason: error.message });
            }
        }
        return { successCount, failures };
    },

    upgradeClass: async (oldClassId, data) => {
        const { name, semester, start_date, end_date, teacher_id, student_ids, course_id } = data;
        
        if (!name || !semester || !start_date || !end_date) {
            throw new ConflictError("Thiếu thông tin bắt buộc (Tên lớp, Học kỳ, Ngày khai giảng, Ngày bế giảng).");
        }
        
        if (new Date(end_date) <= new Date(start_date)) {
            throw new ConflictError("Ngày kết thúc phải diễn ra sau ngày khai giảng.");
        }

        const oldClass = await Class.findByPk(oldClassId);
        if (!oldClass) throw new NotFoundError("Lớp học cũ không tồn tại: " + oldClassId);

        const gradeMatch = oldClass.name.match(/\d+/);
        if (gradeMatch && parseInt(gradeMatch[0], 10) >= 12) {
            throw new ConflictError("Lớp 12 là khối cuối cấp, không thể thực hiện lên lớp tự động.");
        }

        const existing = await Class.findOne({
            where: {
                name: name,
                course_id: oldClass.course_id,
                semester: semester
            }
        });
        if (existing) throw new ConflictError(`Lớp ${name} đã tồn tại cho môn học này trong học kỳ ${semester}.`);

        let initialStatus = "active";
        if (new Date(start_date) > new Date()) {
            initialStatus = "upcoming";
        }

        const newCourseId = course_id || oldClass.course_id;

        const newClass = await Class.create({
            course_id: newCourseId,
            name: name,
            semester: semester,
            max_capacity: oldClass.max_capacity,
            start_date: start_date,
            end_date: end_date,
            teacher_id: teacher_id || null,
            status: initialStatus
        });

        try {
            if (student_ids && Array.isArray(student_ids) && student_ids.length > 0) {
                // Ensure no undefined or null user ids
                const validIds = student_ids.filter(id => id);
                if (validIds.length > 0) {
                    const enrollmentsToCreate = validIds.map(userId => ({
                        class_id: newClass.id,
                        user_id: userId,
                        status: "active"
                    }));
                    await Enrollment.bulkCreate(enrollmentsToCreate);
                }
            }

            await oldClass.update({ status: "closed" });
        } catch (error) {
            // Delete the class if any subsequent step fails
            await newClass.destroy({ force: true });
            throw error;
        }

        return newClass;
    },

    // --- UC_ADM_12: PHÂN CÔNG GIÁO VIÊN ---
    assignTeacher: async (classId, teacherId) => {
        const cls = await Class.findByPk(classId, {
            include: [{ model: ClassSession, as: "sessions" }]
        });

        if (!cls) throw new NotFoundError("Lớp học không tồn tại");

        // A2: Gỡ phân công (Unassign)
        if (!teacherId) {
            return await cls.update({ teacher_id: null });
        }

        // Verify teacher exists and is active
        const teacher = await User.findByPk(teacherId);
        if (!teacher || teacher.status !== "active") {
            throw new ConflictError("Giáo viên không tồn tại hoặc không ở trạng thái Active");
        }

        // E2: Lớp học chưa có lịch
        if (!cls.sessions || cls.sessions.length === 0) {
            throw new ConflictError("Vui lòng cấu hình lịch học (Ca/Thứ) cho lớp này trước khi phân công Giáo viên.");
        }

        // E1: Xung đột lịch (BR_SCHED_01)
        // Lấy tất cả các lớp mà GV này đang dạy (trạng thái active) kèm sessions
        const teacherClasses = await Class.findAll({
            where: {
                teacher_id: teacherId,
                status: "active",
                id: { [Sequelize.Op.ne]: classId } // Exclude current class
            },
            include: [{ model: ClassSession, as: "sessions" }]
        });

        for (const targetSession of cls.sessions) {
            const tStart = new Date(targetSession.start_time).getTime();
            const tEnd = new Date(targetSession.end_time).getTime();

            for (const tClass of teacherClasses) {
                for (const existingSession of tClass.sessions) {
                    const eStart = new Date(existingSession.start_time).getTime();
                    const eEnd = new Date(existingSession.end_time).getTime();

                    // Check for overlap: max(start1, start2) < min(end1, end2)
                    if (Math.max(tStart, eStart) < Math.min(tEnd, eEnd)) {
                        throw new ConflictError(`Không thể phân công. Giáo viên ${teacher.full_name} bị trùng lịch với lớp ${tClass.name}. Vui lòng chọn Giáo viên khác.`);
                    }
                }
            }
        }

        // All checks passed, assign the teacher
        return await cls.update({ teacher_id: teacherId });
    },
    
    // --- HELPERS ---
    checkSessionConflict: async (sessionData, excludeSessionIds = []) => {
        const { start_time, end_time, room, teacher_id } = sessionData;
        
        const where = {
            status: { [Sequelize.Op.ne]: 'cancelled' },
            id: { [Sequelize.Op.notIn]: excludeSessionIds },
            [Sequelize.Op.and]: [
                {
                    start_time: { [Sequelize.Op.lt]: end_time },
                    end_time: { [Sequelize.Op.gt]: start_time }
                }
            ],
            [Sequelize.Op.or]: []
        };

        if (room && room !== "N/A") {
            where[Sequelize.Op.or].push({ room });
        }
        if (teacher_id) {
            where[Sequelize.Op.or].push({ '$class.teacher_id$': teacher_id });
        }

        if (where[Sequelize.Op.or].length === 0) return null;

        const conflict = await ClassSession.findOne({
            where,
            include: [{ 
                model: Class, 
                as: 'class', 
                attributes: ['name', 'teacher_id'],
                required: true 
            }]
        });

        if (conflict) {
            const type = conflict.room === room ? `Phòng ${room}` : `Giáo viên`;
            const dateStr = new Date(conflict.start_time).toLocaleDateString("vi-VN");
            throw new ConflictError(`${type} đã bị trùng lịch tại lớp ${conflict.class?.name} vào ngày ${dateStr}.`);
        }
    },

    // --- ADD SESSION ---
    addSession: async (classId, sessionData) => {
        const { day_of_week, start_time, end_time, room, teacher_id, specific_date } = sessionData;
        const cls = await Class.findByPk(classId);
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");

        if (!start_time || !end_time) {
            throw new ConflictError("Vui lòng nhập đầy đủ Giờ bắt đầu, Giờ kết thúc");
        }

        const sessionsToCreate = [];

        // CASE 1: Specific single date (New priority)
        if (specific_date) {
            const sessionStart = new Date(`${specific_date}T${start_time}:00+07:00`);
            const sessionEnd = new Date(`${specific_date}T${end_time}:00+07:00`);

            // Validate conflict
            await adminService.checkSessionConflict({
                start_time: sessionStart,
                end_time: sessionEnd,
                room,
                teacher_id
            });

            sessionsToCreate.push({
                class_id: classId,
                room: room || "N/A",
                start_time: sessionStart,
                end_time: sessionEnd,
                status: 'scheduled'
            });
        } 
        // CASE 2: Day of Week recurring (Legacy logic)
        else if (day_of_week) {
            const dayMap = {
                "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6,
                "Chủ Nhật": 0, "Thứ Hai": 1, "Thứ Ba": 2, "Thứ Tư": 3, "Thứ Năm": 4, "Thứ Sáu": 5, "Thứ Bảy": 6
            };
            const targetDay = dayMap[day_of_week];
            if (targetDay === undefined) throw new ConflictError("Ngày trong tuần không hợp lệ");

            let currentDate = new Date(cls.start_date + "T00:00:00");
            const endDate = new Date(cls.end_date + "T00:00:00");

            while (currentDate <= endDate) {
                if (currentDate.getDay() === targetDay) {
                    const Y = currentDate.getFullYear();
                    const M = String(currentDate.getMonth() + 1).padStart(2, '0');
                    const D = String(currentDate.getDate()).padStart(2, '0');
                    const dateStr = `${Y}-${M}-${D}`;

                    const sessionStart = new Date(`${dateStr}T${start_time}:00+07:00`);
                    const sessionEnd = new Date(`${dateStr}T${end_time}:00+07:00`);

                    // Validate conflict for each session in recurrence
                    await adminService.checkSessionConflict({
                        start_time: sessionStart,
                        end_time: sessionEnd,
                        room,
                        teacher_id
                    });

                    sessionsToCreate.push({
                        class_id: classId,
                        room: room || "N/A",
                        start_time: sessionStart,
                        end_time: sessionEnd,
                        status: 'scheduled'
                    });
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }
        } else {
            throw new ConflictError("Vui lòng chọn ngày học hoặc thứ trong tuần");
        }

        if (sessionsToCreate.length === 0) {
            throw new ConflictError(`Khoảng thời gian của lớp học (${cls.start_date} - ${cls.end_date}) quá ngắn, không có ngày ${day_of_week} nào phù hợp.`);
        }

        const sessions = await ClassSession.bulkCreate(sessionsToCreate);

        // Map the session-level teacher selection to the Class level teacher
        if (teacher_id !== undefined) {
            await adminService.assignTeacher(classId, teacher_id || null);
        }

        return sessions;
    },

    // --- DELETE SESSIONS (GROUP - SOFT DELETE) ---
    deleteSessions: async (classId, sessionIds) => {
        if (!sessionIds || sessionIds.length === 0) {
            throw new ConflictError("Vui lòng cung cấp danh sách buổi học cần xóa");
        }
        return await ClassSession.update(
            { status: "cancelled" },
            {
                where: {
                    id: { [Sequelize.Op.in]: sessionIds },
                    class_id: classId
                }
            }
        );
    },

    // --- EDIT SESSIONS (GROUP) ---
    editSessions: async (classId, sessionData) => {
        const { sessionIds, day_of_week, start_time, end_time, room, teacher_id, specific_date } = sessionData;
        if (!sessionIds || sessionIds.length === 0) {
            throw new ConflictError("Vui lòng cung cấp danh sách buổi học cần sửa");
        }

        const cls = await Class.findByPk(classId);
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");

        // If not using specific_date, we need to validate day_of_week like before
        if (!specific_date && day_of_week) {
            const dayMap = {
                "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6,
                "Chủ Nhật": 0, "Thứ Hai": 1, "Thứ Ba": 2, "Thứ Tư": 3, "Thứ Năm": 4, "Thứ Sáu": 5, "Thứ Bảy": 6,
                "CN": 0, "T2": 1, "T3": 2, "T4": 3, "T5": 4, "T6": 5, "T7": 6
            };
            const targetDay = dayMap[day_of_week];
            
            let currentDate = new Date(cls.start_date + "T00:00:00");
            const endDate = new Date(cls.end_date + "T00:00:00");
            let sampleCount = 0;
            while (currentDate <= endDate) {
                if (currentDate.getDay() === targetDay) sampleCount++;
                currentDate.setDate(currentDate.getDate() + 1);
            }

            if (sampleCount === 0) {
                throw new ConflictError(`Lớp học (${cls.start_date} - ${cls.end_date}) không chứa ngày ${day_of_week} nào.`);
            }
        }

        // Delete old sessions first
        // We MUST NOT pass excludeSessionIds here because we delete them before re-creating
        await adminService.deleteSessions(classId, sessionIds);

        // Regenerate completely new sessions for the updated schedule
        return await adminService.addSession(classId, { day_of_week, start_time, end_time, room, teacher_id, specific_date });
    },

    updateSession: async (classId, sessionId, data) => {
        const { start_time, end_time, room, teacher_id } = data;
        const session = await ClassSession.findByPk(sessionId);
        if (!session) throw new NotFoundError("Buổi học không tồn tại");

        if (start_time || end_time || room || teacher_id) {
            await adminService.checkSessionConflict({
                start_time: start_time || session.start_time,
                end_time: end_time || session.end_time,
                room: room || session.room,
                teacher_id: teacher_id !== undefined ? teacher_id : session.teacher_id
            }, [sessionId]);
        }
        
        await session.update({
            start_time: start_time || session.start_time,
            end_time: end_time || session.end_time,
            room: room || session.room,
        });
        return session;
    },

    // --- STUDENTS ---
    getAllStudents: async () => {
        // Find all active students (Role: student, status: active)
        const students = await User.findAll({
            where: { status: "active" },
            attributes: ["id", "full_name", "email", "phone"],
            include: [{
                model: Role,
                as: "role",
                where: { code: "STUDENT" }
            }]
        });
        return students;
    },

    enrollStudents: async (classId, studentIds) => {
        if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
            throw new ConflictError("Vui lòng chọn ít nhất 1 học sinh để thêm vào lớp");
        }

        const cls = await Class.findByPk(classId);
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");

        // Verify all students exist and are active
        const validStudents = await User.findAll({
            where: {
                id: { [Sequelize.Op.in]: studentIds },
                status: "active"
            },
            include: [{ model: Role, as: "role", where: { code: "STUDENT" } }]
        });

        if (validStudents.length !== studentIds.length) {
            throw new ConflictError("Một số học sinh được chọn không hợp lệ hoặc không phải là học sinh kích hoạt.");
        }

        // Check if any students are already enrolled
        const existingEnrollments = await Enrollment.findAll({
            where: {
                class_id: classId,
                user_id: { [Sequelize.Op.in]: studentIds }
            }
        });

        const existingIds = existingEnrollments.map(e => e.user_id);
        const newStudentIds = studentIds.filter(id => !existingIds.includes(id));

        if (newStudentIds.length === 0) {
            throw new ConflictError("Tất cả học sinh được chọn đã có trong lớp này rồi.");
        }

        const currentEnrollmentCount = await Enrollment.count({ where: { class_id: classId } });
        if (currentEnrollmentCount + newStudentIds.length > cls.max_capacity) {
            throw new ConflictError(`Không thể thêm ${newStudentIds.length} học sinh mới vì sẽ vượt sĩ số tối đa của lớp (${cls.max_capacity}). Lớp hiện có ${currentEnrollmentCount} học sinh.`);
        }

        // Create new enrollments
        const enrollmentsToCreate = newStudentIds.map(userId => ({
            class_id: classId,
            user_id: userId,
            status: "active"
        }));

        return await Enrollment.bulkCreate(enrollmentsToCreate);
    },

    importStudents: async (classId, emails) => {
        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            throw new ConflictError("Không tìm thấy email hợp lệ nào trong file.");
        }

        const cls = await Class.findByPk(classId);
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");

        // Lowercase emails for comparison
        const targetEmails = emails.map(e => e.toLowerCase());

        // Find existing users with those emails and role STUDENT
        const foundStudents = await User.findAll({
            where: {
                email: { [Sequelize.Op.in]: targetEmails },
                status: "active"
            },
            include: [{ model: Role, as: "role", where: { code: "STUDENT" } }]
        });

        const foundEmails = foundStudents.map(s => s.email.toLowerCase());
        const failedEmails = targetEmails.filter(e => !foundEmails.includes(e));

        const studentIds = foundStudents.map(s => s.id);
        let newStudentIds = [];
        let alreadyEnrolledCount = 0;

        if (studentIds.length > 0) {
            // Check if already enrolled
            const existingEnrollments = await Enrollment.findAll({
                where: {
                    class_id: classId,
                    user_id: { [Sequelize.Op.in]: studentIds }
                }
            });

            const existingIds = existingEnrollments.map(e => e.user_id);
            newStudentIds = studentIds.filter(id => !existingIds.includes(id));
            alreadyEnrolledCount = existingIds.length;
        }

        if (newStudentIds.length > 0) {
            const currentEnrollmentCount = await Enrollment.count({ where: { class_id: classId } });
            if (currentEnrollmentCount + newStudentIds.length > cls.max_capacity) {
                throw new ConflictError(`Lớp học sẽ vượt quá sĩ số tối đa (${cls.max_capacity}) nếu nhập thêm ${newStudentIds.length} học sinh. Hiện tại lớp đã có ${currentEnrollmentCount} học sinh.`);
            }

            // Create new enrollments
            const enrollmentsToCreate = newStudentIds.map(userId => ({
                class_id: classId,
                user_id: userId,
                status: "active"
            }));

            await Enrollment.bulkCreate(enrollmentsToCreate);
        }

        return {
            total_found: foundStudents.length,
            total_imported: newStudentIds.length,
            already_enrolled: alreadyEnrolledCount,
            failed_emails: failedEmails
        };
    },

    validateStudentImport: async (classId, rows) => {
        const cls = await Class.findByPk(classId);
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");

        const validRows = [];
        const invalidRows = [];

        // Lấy danh sách email từ file
        const rawEmails = rows.map(r => String(r.email || '').toLowerCase().trim()).filter(e => e);

        // Fetch students all at once
        const foundStudents = await User.findAll({
            where: {
                email: { [Sequelize.Op.in]: rawEmails },
                status: "active"
            },
            include: [{ model: Role, as: "role", where: { code: "STUDENT" } }]
        });
        const foundStudentMap = new Map();
        foundStudents.forEach(s => foundStudentMap.set(s.email.toLowerCase(), s));

        // Fetch current enrollments
        const existingEnrollments = await Enrollment.findAll({ where: { class_id: classId } });
        const existingUserIds = new Set(existingEnrollments.map(e => e.user_id));
        const currentEnrollmentCount = existingUserIds.size;

        let projectedNewCount = 0;
        const seenEmailsInFile = new Set(); // Prevent duplicates in the same file

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rawEmail = String(row.email || "").toLowerCase().trim();

            if (!rawEmail) {
                invalidRows.push({ ...row, rowNumber: i + 1, reason: "Thiếu cột Email" });
                continue;
            }

            if (seenEmailsInFile.has(rawEmail)) {
                invalidRows.push({ ...row, rowNumber: i + 1, reason: "Bị trùng lặp email ngay trong file Excel" });
                continue;
            }
            seenEmailsInFile.add(rawEmail);

            const student = foundStudentMap.get(rawEmail);
            if (!student) {
                invalidRows.push({ ...row, rowNumber: i + 1, reason: "Tài khoản học sinh không tồn tại hoặc sai vai trò" });
                continue;
            }

            if (existingUserIds.has(student.id)) {
                invalidRows.push({ ...row, rowNumber: i + 1, reason: "Học sinh này đã nằm trong lớp" });
                continue;
            }

            if (currentEnrollmentCount + projectedNewCount + 1 > cls.max_capacity) {
                invalidRows.push({ ...row, rowNumber: i + 1, reason: `Vượt quá sĩ số tối đa của lớp (${cls.max_capacity})` });
                continue;
            }

            validRows.push({
                ...row,
                rowNumber: i + 1,
                user_id: student.id,
                full_name: student.full_name,
                email: student.email,
                student_code: student.student_code || "---"
            });
            projectedNewCount++;
        }

        return { validRows, invalidRows };
    },

    confirmStudentImport: async (classId, validRows) => {
        const cls = await Class.findByPk(classId);
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");

        let successCount = 0;
        const failures = [];

        for (const row of validRows) {
            try {
                await Enrollment.create({
                    class_id: classId,
                    user_id: row.user_id,
                    status: "active"
                });
                successCount++;
            } catch (error) {
                failures.push({ name: row.email, reason: error.message });
            }
        }

        return { successCount, failures };
    },

    unenrollStudent: async (classId, studentId) => {
        const cls = await Class.findByPk(classId);
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");

        const enrollment = await Enrollment.findOne({
            where: {
                class_id: classId,
                user_id: studentId
            }
        });

        if (!enrollment) {
            throw new NotFoundError("Học sinh này chưa được tham gia vào lớp học");
        }

        // Hard delete for simple unenrollment, or you can update status to 'dropped' based on requirements
        // Doing hard delete to keep DB clean for MVP
        return await enrollment.destroy();
    },

    // --- DASHBOARD & REPORTS (UC_ADM_17 & UC_ADM_18) ---
    getDashboardStats: async () => {
        const totalStudents = await User.count({ include: [{ model: Role, as: 'role', where: { code: 'STUDENT' } }], where: { status: 'active' } });
        const totalTeachers = await User.count({ include: [{ model: Role, as: 'role', where: { code: 'TEACHER' } }], where: { status: 'active' } });
        const activeClasses = await Class.count({ where: { status: 'active' } });

        // submissionsToday
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const submissionsToday = await Submission.count({
            where: {
                submitted_at: {
                    [Sequelize.Op.gte]: today,
                    [Sequelize.Op.lt]: tomorrow
                }
            }
        });

        // calculate grade distribution for all grades
        let A = 0, B = 0, C = 0, D = 0, F = 0;
        try {
            const [gradeRows] = await Grade.sequelize.query(
                `SELECT final_score as score FROM grades WHERE final_score IS NOT NULL`
            );
            gradeRows.forEach(g => {
                const score = parseFloat(g.score);
                if (score >= 9) A++;
                else if (score >= 8) B++;
                else if (score >= 7) C++;
                else if (score >= 5) D++;
                else F++;
            });
        } catch (e) {
            console.log('[Dashboard] Grade score column error:', e.message);
        }
        const gradeDistributionData = [
            { name: "A", value: A }, { name: "B", value: B }, { name: "C", value: C }, { name: "D", value: D }, { name: "F", value: F }
        ];

        // studentsByCourseData
        const enrollments = await Enrollment.findAll({
            include: [{ model: Class, as: 'class', include: [{ model: Course, as: 'course' }] }]
        });
        const courseMap = {};
        enrollments.forEach(e => {
            if (e.class && e.class.course) {
                const code = e.class.course.code;
                courseMap[code] = (courseMap[code] || 0) + 1;
            }
        });
        let studentsByCourseData = Object.keys(courseMap).slice(0, 4).map(k => ({ name: k, students: courseMap[k] }));
        if (studentsByCourseData.length === 0) {
            studentsByCourseData = [{ name: "Không có dữ liệu", students: 0 }];
        }

        // recentActivities
        const recentClasses = await Class.findAll({ order: [['created_at', 'DESC']], limit: 5 });
        const recentActivities = recentClasses.map((c, i) => ({
            id: c.id,
            action: `Lớp học được ${c.status === 'active' ? 'tạo mới' : 'cập nhật'}`,
            details: `Hệ thống - ${c.name}`,
            time: new Date(c.created_at).toLocaleDateString("vi-VN"),
            color: c.status === 'active' ? "bg-green-500" : "bg-blue-500"
        }));

        if (recentActivities.length === 0) {
            recentActivities.push({ id: 1, action: "Khởi tạo hệ thống", details: "Mọi tính năng sẵn sàng", time: "Hiện tại", color: "bg-blue-500" });
        }

        return {
            statsData: { totalStudents, totalTeachers, activeClasses, submissionsToday },
            gradeDistributionData,
            studentsByCourseData,
            recentActivities
        };
    },

    getReportData: async (semester, courseCode, dateRange, classId, startDate, endDate) => {
        // UC Exception E2: Phạm vi truy xuất dữ liệu quá lớn
        // If "All Semesters" is selected AND "All Courses" is selected, it's too broad.
        // Also if Custom Range is selected and > 365 days (though currently custom range is not fully implemented in getReportData)

        const isBroadSemester = !semester || semester === "All Semesters" || semester === "";
        const isBroadCourse = !courseCode || courseCode === "All Courses" || courseCode === "";

        if (isBroadSemester && isBroadCourse && !classId) {
            const error = new Error("Phạm vi dữ liệu quá lớn để hiển thị cùng lúc. Vui lòng thu hẹp điều kiện lọc (chọn từng học kỳ cụ thể) và thử lại.");
            error.status = 400;
            error.isOperational = true;
            throw error;
        }

        let classWhere = {};
        if (semester && semester !== "All Semesters") classWhere.semester = semester;

        if (courseCode && courseCode !== "All Courses" && courseCode !== "") {
            // Find course by code or full name (case insensitive)
            const Op = Course.sequelize.Sequelize.Op;
            const course = await Course.findOne({
                where: {
                    [Op.or]: [
                        { code: { [Op.iLike]: courseCode } },
                        { name: { [Op.iLike]: `%${courseCode}%` } },
                        { code: { [Op.iLike]: courseCode.split(" ")[0] } }
                    ]
                }
            });
            if (course) classWhere.course_id = course.id;
        }

        if (classId && classId !== "All Classes") {
            classWhere.id = classId;
        }

        // Get grades for classes that match the filter
        let whereClause = `WHERE g.final_score IS NOT NULL`;
        if (classWhere.semester) whereClause += ` AND cl.semester = '${classWhere.semester.replace(/'/g, "''")}'`;
        if (classWhere.course_id) whereClause += ` AND cl.course_id = '${classWhere.course_id}'`;
        if (classWhere.id) whereClause += ` AND cl.id = '${classWhere.id}'`;

        // Date range filtering
        const isValidDate = (d) => d && d !== 'undefined' && d !== '';
        
        if (dateRange === 'Custom Range') {
            if (isValidDate(startDate)) whereClause += ` AND (s.submitted_at >= '${startDate} 00:00:00' OR g.graded_at >= '${startDate} 00:00:00')`;
            if (isValidDate(endDate)) whereClause += ` AND (s.submitted_at <= '${endDate} 23:59:59' OR g.graded_at <= '${endDate} 23:59:59')`;
        } else if (dateRange === 'This Week') {
            whereClause += ` AND (s.submitted_at >= CURRENT_DATE - INTERVAL '7 days' OR g.graded_at >= CURRENT_DATE - INTERVAL '7 days')`;
        } else if (dateRange === 'This Month') {
            whereClause += ` AND (s.submitted_at >= date_trunc('month', CURRENT_DATE) OR g.graded_at >= date_trunc('month', CURRENT_DATE))`;
        } else if (dateRange === 'This Semester') {
            whereClause += ` AND (s.submitted_at >= CURRENT_DATE - INTERVAL '4 months' OR g.graded_at >= CURRENT_DATE - INTERVAL '4 months')`;
        }

        let A = 0, B = 0, C = 0, D = 0, F = 0;
        try {
            const [gradeRows] = await Grade.sequelize.query(`
                SELECT g.final_score as score 
                FROM grades g
                JOIN submissions s ON g.submission_id = s.id
                JOIN assessments a ON s.assessment_id = a.id
                JOIN classes cl ON a.class_id = cl.id
                ${whereClause}
            `);
            gradeRows.forEach(g => {
                const score = parseFloat(g.score);
                if (score >= 9) A++;
                else if (score >= 8) B++;
                else if (score >= 7) C++;
                else if (score >= 5) D++;
                else F++;
            });
        } catch (e) {
            console.log('[Reports] Lỗi truy vấn điểm:', e.message);
        }

        const total = A + B + C + D + F || 1; // avoid /0
        const allGrades = [
            { name: `A`, pct: Math.round((A / total) * 100), value: A, color: "#6366f1" },
            { name: `B`, pct: Math.round((B / total) * 100), value: B, color: "#a855f7" },
            { name: `C`, pct: Math.round((C / total) * 100), value: C, color: "#f43f5e" },
            { name: `D`, pct: Math.round((D / total) * 100), value: D, color: "#f59e0b" },
            { name: `F`, pct: Math.round((F / total) * 100), value: F, color: "#3b82f6" }
        ];

        const gradePercentageData = allGrades
            .filter(g => g.value > 0)
            .map(g => ({ name: `${g.name} (${g.pct}%)`, value: g.pct, color: g.color }));

        let courseMap = {};
        const enrollments = await Enrollment.findAll({
            include: [{ model: Class, as: 'class', where: classWhere, include: [{ model: Course, as: 'course' }] }]
        });
        enrollments.forEach(e => {
            if (e.class && e.class.course) {
                const name = `${e.class.course.code} - ${e.class.course.name}`;
                courseMap[name] = (courseMap[name] || 0) + 1;
            }
        });

        let courseEnrollmentData = Object.keys(courseMap).map(k => ({ name: k, students: courseMap[k] }));
        if (courseEnrollmentData.length === 0) {
            courseEnrollmentData = [{ name: "Không có dữ liệu", students: 0 }];
        }

        // Summary stats
        const totalStudents = Object.values(courseMap).reduce((s, v) => s + v, 0);
        const gradeTotal = A + B + C + D + F;
        const passCount = A + B + C + D; // score >= 5
        const passRate = gradeTotal > 0 ? Math.round((passCount / gradeTotal) * 100) : 0;
        const aPercent = gradeTotal > 0 ? Math.round((A / gradeTotal) * 100) : 0;

        // Average grade letter
        let avgGrade = 'N/A';
        try {
            let sqlWhereAvg = `WHERE g.final_score IS NOT NULL`;
            if (classWhere.semester) sqlWhereAvg += ` AND cl.semester = '${classWhere.semester.replace(/'/g, "''")}'`;
            if (classWhere.course_id) sqlWhereAvg += ` AND cl.course_id = '${classWhere.course_id}'`;
            if (classWhere.id) sqlWhereAvg += ` AND cl.id = '${classWhere.id}'`;

            // Add date filters to avg calculation
            if (dateRange === 'Custom Range') {
                if (isValidDate(startDate)) sqlWhereAvg += ` AND (s.submitted_at >= '${startDate} 00:00:00' OR g.graded_at >= '${startDate} 00:00:00')`;
                if (isValidDate(endDate)) sqlWhereAvg += ` AND (s.submitted_at <= '${endDate} 23:59:59' OR g.graded_at <= '${endDate} 23:59:59')`;
            } else if (dateRange === 'This Week') {
                sqlWhereAvg += ` AND (s.submitted_at >= CURRENT_DATE - INTERVAL '7 days' OR g.graded_at >= CURRENT_DATE - INTERVAL '7 days')`;
            } else if (dateRange === 'This Month') {
                sqlWhereAvg += ` AND (s.submitted_at >= date_trunc('month', CURRENT_DATE) OR g.graded_at >= date_trunc('month', CURRENT_DATE))`;
            } else if (dateRange === 'This Semester') {
                sqlWhereAvg += ` AND (s.submitted_at >= CURRENT_DATE - INTERVAL '4 months' OR g.graded_at >= CURRENT_DATE - INTERVAL '4 months')`;
            }

            const [avgRows] = await Grade.sequelize.query(`
                SELECT AVG(g.final_score::numeric) as avg_score
                FROM grades g
                JOIN submissions s ON g.submission_id = s.id
                JOIN assessments a ON s.assessment_id = a.id
                JOIN classes cl ON a.class_id = cl.id
                ${sqlWhereAvg}
            `);
            const avg = parseFloat(avgRows[0]?.avg_score);
            if (!isNaN(avg)) {
                if (avg >= 9) avgGrade = 'A+';
                else if (avg >= 8.5) avgGrade = 'A';
                else if (avg >= 8) avgGrade = 'B+';
                else if (avg >= 7) avgGrade = 'B';
                else if (avg >= 6.5) avgGrade = 'C+';
                else if (avg >= 5.5) avgGrade = 'C';
                else if (avg >= 5) avgGrade = 'D';
                else avgGrade = 'F';
            }
        } catch (e) { }

        // Detailed table data
        let detailedData = [];
        try {
            // Debug: Check a sample row
            const [samples] = await Grade.sequelize.query(`SELECT * FROM submissions LIMIT 1`);
            if (samples.length > 0) {
                console.log('[Reports DB Debug] Sample submission keys:', Object.keys(samples[0]).join(', '));
            } else {
                console.log('[Reports DB Debug] No submissions found in DB');
            }

            const [detailRows] = await Grade.sequelize.query(`
                SELECT 
                    s.student_id as student_id,
                    cl.id as class_id,
                    COALESCE(u.full_name, 'Học sinh (ID: ' || SUBSTRING(s.student_id::text, 1, 8) || ')') as student_name,
                    cl.name as class_name,
                    a.id as assessment_id,
                    a.type as type,
                    a.title as quiz_name,
                    a.settings_json as assessment_settings,
                    COALESCE(s.submitted_at, g.graded_at) as submitted_at,
                    g.graded_at as graded_at,
                    COALESCE(c2.code, 'N/A') as course_code,
                    g.final_score as score,
                    CASE 
                        WHEN g.final_score >= 9 THEN 'A'
                        WHEN g.final_score >= 8 THEN 'B'
                        WHEN g.final_score >= 7 THEN 'C'
                        WHEN g.final_score >= 5 THEN 'D'
                        ELSE 'F'
                    END as grade_letter
                FROM grades g
                JOIN submissions s ON g.submission_id = s.id
                JOIN assessments a ON s.assessment_id = a.id
                JOIN classes cl ON a.class_id = cl.id
                LEFT JOIN courses c2 ON cl.course_id = c2.id
                LEFT JOIN users u ON s.student_id = u.id
                ${whereClause}
                ORDER BY u.full_name ASC NULLS LAST
            `);
            console.log('[Reports] detailRows count:', detailRows.length);
            if (detailRows.length > 0) {
                console.log('[Reports Server Log] Sample Row Keys:', Object.keys(detailRows[0]));
                console.log('[Reports Server Log] Sample row values:', {
                    student_id: detailRows[0].student_id,
                    submitted_at: detailRows[0].submitted_at,
                    graded_at: detailRows[0].graded_at,
                    score: detailRows[0].score
                });
            }
            detailedData = detailRows;
        } catch (e) {
            console.log('[Reports] Lỗi truy vấn chi tiết:', e.message);
        }

        return {
            gradeDistributionData: allGrades.map(g => ({ name: g.name, students: g.value })),
            gradePercentageData,
            courseEnrollmentData,
            detailedData, // New detailed list
            sqlDebug: whereClause,
            dateRangeDebug: dateRange,
            paramsDebug: { startDate, endDate, semester, courseCode, classId },
            summaryStats: {
                avgGrade,
                passRate,
                totalStudents,
                aStudents: allGrades.find(g => g.name === 'A')?.value || 0,
                gradeTotal: allGrades.reduce((sum, g) => sum + g.value, 0),
                aPercent: ((allGrades.find(g => g.name === 'A')?.value || 0) / (allGrades.reduce((sum, g) => sum + g.value, 0) || 1) * 100).toFixed(1)
            }
        };
    },

    getReportFilters: async () => {
        // Get distinct semesters from classes table
        const [semesterRows] = await Course.sequelize.query(
            `SELECT DISTINCT semester FROM classes WHERE semester IS NOT NULL ORDER BY semester DESC`
        );
        const semesters = semesterRows.map(r => r.semester);

        // Get all active courses
        const courses = await Course.findAll({
            attributes: ['id', 'code', 'name'],
            where: { is_deleted: false },
            order: [['code', 'ASC']]
        });

        // Get all active classes
        const classes = await Class.findAll({
            attributes: ['id', 'name', 'semester', 'course_id'],
            where: { status: 'active' },
            order: [['name', 'ASC']]
        });

        return { semesters, courses, classes };
    },

    getTeacherActivity: async (semester, course, dateRange, classId) => {
        // Build date range filter
        const dateRangeMap = {
            'This Week': `NOW() - INTERVAL '7 days'`,
            'This Month': `DATE_TRUNC('month', NOW())`,
            'This Semester': `NOW() - INTERVAL '6 months'`,
            'Custom Range': `NOW() - INTERVAL '28 days'`,
        };
        const dateFrom = dateRangeMap[dateRange] || `DATE_TRUNC('month', NOW())`;

        // Number of time buckets and step based on range
        let numBuckets = 4;
        let dayStep = 7;
        let bucketLabel = 'Tuần';

        if (dateRange === 'This Week') {
            numBuckets = 7;
            dayStep = 1;
            bucketLabel = 'Ngày';
        } else if (dateRange === 'This Semester') {
            numBuckets = 6;
            dayStep = 30; // Roughly a month
            bucketLabel = 'Tháng';
        }

        // Build class filter clauses
        let semClause = '';
        let courseClause = '';
        let classClause = '';
        if (semester && semester.trim() && semester !== "All Semesters") {
            semClause = `AND cl.semester = '${semester.replace(/'/g, "''")}'`;
        }
        if (course && course.trim() && course !== "All Courses") {
            const courseCode = course.split(' - ')[0].trim();
            courseClause = `AND c2.code = '${courseCode.replace(/'/g, "''")}'`;
        }
        if (classId && classId.trim() && classId !== "All Classes") {
            classClause = `AND cl.id = '${classId}'`;
        }

        const buildCaseExpression = (col, table) => {
            // Using WIDTH_BUCKET for robust grouping into i buckets
            const maxDays = numBuckets * dayStep;
            return `WIDTH_BUCKET(EXTRACT(DAY FROM (${table}.${col} - (${dateFrom}))), 0, ${maxDays}, ${numBuckets})`;
        };

        // Separate queries for reliability
        let qRows = [], mRows = [], gRows = [];
        try {
            const qQuery = `
                SELECT EXTRACT(DAY FROM (a.created_at - (${dateFrom})))::int AS days_diff, COUNT(a.id)::int AS count
                FROM assessments a
                JOIN classes cl ON a.class_id = cl.id
                JOIN courses c2 ON cl.course_id = c2.id
                WHERE a.created_at >= ${dateFrom} AND UPPER(a.type::text) = 'QUIZ'
                ${semClause} ${courseClause} ${classClause}
                GROUP BY days_diff
            `;
            qRows = await Grade.sequelize.query(qQuery, { type: QueryTypes.SELECT });

            const mQuery = `
                SELECT EXTRACT(DAY FROM (m.created_at - (${dateFrom})))::int AS days_diff, COUNT(m.id)::int AS count
                FROM materials m
                JOIN classes cl ON m.class_id = cl.id
                JOIN courses c2 ON cl.course_id = c2.id
                WHERE m.created_at >= ${dateFrom}
                ${semClause} ${courseClause} ${classClause}
                GROUP BY days_diff
            `;
            mRows = await Grade.sequelize.query(mQuery, { type: QueryTypes.SELECT });

            const gQuery = `
                SELECT EXTRACT(DAY FROM (g.graded_at - (${dateFrom})))::int AS days_diff, COUNT(g.id)::int AS count
                FROM grades g
                JOIN submissions s ON g.submission_id = s.id
                JOIN assessments a ON s.assessment_id = a.id
                JOIN classes cl ON a.class_id = cl.id
                JOIN courses c2 ON cl.course_id = c2.id
                WHERE g.graded_at >= ${dateFrom} AND g.graded_at IS NOT NULL
                ${semClause} ${courseClause} ${classClause}
                GROUP BY days_diff
            `;
            gRows = await Grade.sequelize.query(gQuery, { type: QueryTypes.SELECT });
        } catch (err) {
            console.error('[getTeacherActivity] query error:', err.message);
        }

        // Build chart data
        const chartMap = {};
        for (let i = 1; i <= numBuckets; i++) chartMap[i] = { quizzes: 0, materials: 0, graded: 0 };

        const mapToBucket = (rows, field) => {
            rows.forEach(r => {
                const days = parseInt(r.days_diff ?? r.DAYS_DIFF ?? 0);
                let w = Math.floor(days / dayStep) + 1;
                if (w > numBuckets) w = numBuckets;
                if (w < 1) w = 1;
                if (chartMap[w]) chartMap[w][field] += parseInt(r.count ?? r.COUNT) || 0;
            });
        };

        mapToBucket(qRows, 'quizzes');
        mapToBucket(mRows, 'materials');
        mapToBucket(gRows, 'graded');
        const activityChartData = Array.from({ length: numBuckets }, (_, i) => ({
            name: `${bucketLabel} ${i + 1}`,
            quizzesCreated: chartMap[i + 1].quizzes,
            materialsUploaded: chartMap[i + 1].materials,
            assignmentsGraded: chartMap[i + 1].graded
        }));

        // Total counts for the date range
        let total_quizzes = 0, total_materials = 0, total_graded = 0;
        try {
            const [r] = await Grade.sequelize.query(`
                SELECT COUNT(a.id)::int as total_quizzes
                FROM assessments a
                JOIN classes cl ON a.class_id = cl.id
                JOIN courses c2 ON cl.course_id = c2.id
                WHERE UPPER(a.type::text) = 'QUIZ'
                  AND a.created_at >= ${dateFrom}
                  ${semClause} ${courseClause} ${classClause}
            `, { type: QueryTypes.SELECT });
            total_quizzes = r?.total_quizzes || 0;
        } catch (e) {
            console.error('[getTeacherActivity] total_quizzes error:', e.message);
        }

        try {
            const [r] = await Grade.sequelize.query(`
                SELECT COUNT(m.id)::int as total_materials
                FROM materials m
                JOIN classes cl ON m.class_id = cl.id
                JOIN courses c2 ON cl.course_id = c2.id
                WHERE m.created_at >= ${dateFrom}
                  ${semClause} ${courseClause} ${classClause}
            `, { type: QueryTypes.SELECT });
            total_materials = r?.total_materials || 0;
        } catch (e) { }

        try {
            const [r] = await Grade.sequelize.query(`
                SELECT COUNT(g.id)::int as total_graded
                FROM grades g
                JOIN submissions s ON g.submission_id = s.id
                JOIN assessments a ON s.assessment_id = a.id
                JOIN classes cl ON a.class_id = cl.id
                JOIN courses c2 ON cl.course_id = c2.id
                WHERE g.graded_at IS NOT NULL
                  AND g.graded_at >= ${dateFrom}
                  ${semClause} ${courseClause} ${classClause}
            `, { type: QueryTypes.SELECT });
            total_graded = r?.total_graded || 0;
        } catch (e) {
            console.error('[getTeacherActivity] total_graded error:', e.message);
        }
        return {
            activityChartData,
            bucketLabel,
            totals: {
                quizzesCreated: total_quizzes || 0,
                materialsUploaded: total_materials || 0,
                assignmentsGraded: total_graded || 0
            }
        };
    },

    seedDebugData: async () => {
        // Use already imported models from the file scope
        const cls = await Class.findOne();
        const roles = await Role.findAll();
        const teacherRole = roles.find(r => r.code === 'TEACHER');
        const studentRole = roles.find(r => r.code === 'STUDENT');

        const teacher = await User.findOne({ where: { role_id: teacherRole?.id || '' } });
        const student = await User.findOne({ where: { role_id: studentRole?.id || '' } });

        if (!cls || !teacher || !student) throw new Error('Không tìm thấy đủ dữ liệu (Lớp, GV, HS) để seed.');

        const now = new Date();
        // Spread data across 6 months (approx 180 days)
        const buckets = [5, 35, 65, 95, 125, 155];

        for (const days of buckets) {
            const date = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

            await Assessment.create({ class_id: cls.id, title: `Debug Quiz Day ${days}`, assessment_type: 'QUIZ', created_at: date });
            await Material.create({ class_id: cls.id, title: `Debug Material Day ${days}`, created_at: date });

            const ass = await Assessment.create({ class_id: cls.id, title: `Debug Assignment Day ${days}`, assessment_type: 'ASSIGNMENT', created_at: date });
            const sub = await Submission.create({ assessment_id: ass.id, student_id: student.id, status: 'SUBMITTED', created_at: date });
            await Grade.create({ submission_id: sub.id, score: 90, graded_at: date, teacher_id: teacher.id });
        }
        return { message: 'Seed thành công!', count: buckets.length };
    },

    validateScheduleImport: async (rows) => {
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            throw new ConflictError("Danh sách dòng dữ liệu rỗng");
        }

        const classNames = [...new Set(rows.map(r => r.class_name?.trim()).filter(Boolean))];
        const teacherEmails = [...new Set(rows.map(r => r.teacher_email?.trim()).filter(Boolean))];

        const classNamesLower = classNames.map(name => name.toLowerCase());
        const teacherEmailsLower = teacherEmails.map(email => email.toLowerCase());

        const classes = await Class.findAll({
            where: Sequelize.where(
                Sequelize.fn('LOWER', Sequelize.col('name')),
                { [Sequelize.Op.in]: classNamesLower }
            )
        });
        const teachers = await User.findAll({
            where: {
                status: "active",
                [Sequelize.Op.and]: [
                    Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), { [Sequelize.Op.in]: teacherEmailsLower })
                ]
            },
            include: [{ model: Role, as: "role", where: { code: "TEACHER" } }]
        });

        const classMap = {};
        classes.forEach(c => classMap[c.name.toLowerCase()] = c);

        const teacherMap = {};
        teachers.forEach(t => teacherMap[t.email.toLowerCase()] = t);

        const teacherIds = teachers.map(t => t.id);
        const rooms = [...new Set(rows.map(r => r.room?.trim()).filter(Boolean))];

        const dbSessions = await ClassSession.findAll({
            where: {
                status: "scheduled",
                [Sequelize.Op.or]: [
                    { room: { [Sequelize.Op.in]: rooms } },
                    { "$class.teacher_id$": { [Sequelize.Op.in]: teacherIds } }
                ]
            },
            include: [{ model: Class, as: "class", attributes: ["teacher_id"] }]
        });

        const activeSchedules = dbSessions.map(s => ({
            start: new Date(s.start_time).getTime(),
            end: new Date(s.end_time).getTime(),
            room: s.room ? s.room.trim().toLowerCase() : "",
            teacher_id: s.class?.teacher_id || null
        }));

        const validRows = [];
        const invalidRows = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 1;
            let errors = [];

            const cName = row.class_name?.trim() || "";
            const tEmail = row.teacher_email?.trim() || "";
            const dateStr = row.date?.trim() || "";
            const startStr = row.start_time?.trim() || "";
            const endStr = row.end_time?.trim() || "";
            const roomNum = row.room?.trim() || "";
            const topicStr = row.topic?.trim() || "Buổi học";

            if (!cName) errors.push("Thiếu Tên lớp");
            if (!tEmail) errors.push("Thiếu Email Giáo viên");
            if (!dateStr) errors.push("Thiếu Ngày học");
            if (!startStr) errors.push("Thiếu Giờ bắt đầu");
            if (!endStr) errors.push("Thiếu Giờ kết thúc");

            if (errors.length > 0) {
                invalidRows.push({ ...row, rowNum, error: errors.join(", ") });
                continue;
            }

            const cls = classMap[cName.toLowerCase()];
            const teacher = teacherMap[tEmail.toLowerCase()];

            if (!cls) errors.push(`Lớp '${cName}' không tồn tại hoặc không hoạt động`);
            if (!teacher) errors.push(`Giáo viên '${tEmail}' không tồn tại hoặc không hoạt động`);

            if (errors.length > 0) {
                invalidRows.push({ ...row, rowNum, error: errors.join(", ") });
                continue;
            }

            const dateParts = dateStr.split("/");
            if (dateParts.length !== 3) {
                invalidRows.push({ ...row, rowNum, error: "Định dạng ngày phải là dd/MM/yyyy" });
                continue;
            }
            const day = dateParts[0].trim().padStart(2, '0');
            const month = dateParts[1].trim().padStart(2, '0');
            let year = dateParts[2].trim();
            if (year.length === 2) year = "20" + year; // Convert 2-digit to 4-digit year
            const dateISO = `${year}-${month}-${day}`; // yyyy-MM-dd

            if (cls.start_date && dateISO < cls.start_date) {
                invalidRows.push({ ...row, rowNum, error: `Ngày học (${dateStr}) trước ngày bắt đầu lớp (${cls.start_date})` });
                continue;
            }
            if (cls.end_date && dateISO > cls.end_date) {
                invalidRows.push({ ...row, rowNum, error: `Ngày học (${dateStr}) sau ngày kết thúc lớp (${cls.end_date})` });
                continue;
            }

            const padTime = (t) => {
                const parts = t.split(":");
                if (parts.length < 2) return t;
                return `${parts[0].trim().padStart(2, '0')}:${parts[1].trim().padStart(2, '0')}`;
            };
            const startStrPadded = padTime(startStr);
            const endStrPadded = padTime(endStr);

            const sessionStart = new Date(`${dateISO}T${startStrPadded}:00`);
            const sessionEnd = new Date(`${dateISO}T${endStrPadded}:00`);

            if (isNaN(sessionStart.getTime()) || isNaN(sessionEnd.getTime())) {
                invalidRows.push({ ...row, rowNum, error: "Định dạng Ngày/Giờ không hợp lệ" });
                continue;
            }

            if (sessionEnd <= sessionStart) {
                invalidRows.push({ ...row, rowNum, error: "Giờ kết thúc phải sau Giờ bắt đầu" });
                continue;
            }

            const tStart = sessionStart.getTime();
            const tEnd = sessionEnd.getTime();

            let isOverlap = false;
            let overlapReason = "";

            for (const s of activeSchedules) {
                const overlap = Math.max(tStart, s.start) < Math.min(tEnd, s.end);
                if (overlap) {
                    if (roomNum && s.room === roomNum.toLowerCase()) {
                        isOverlap = true;
                        overlapReason = `Trùng lịch sử dụng Phòng ${roomNum}`;
                        break;
                    }
                    if (teacher.id === s.teacher_id) {
                        isOverlap = true;
                        overlapReason = `Giáo viên ${tEmail} bị trùng lịch dạy`;
                        break;
                    }
                }
            }

            if (isOverlap) {
                invalidRows.push({ ...row, rowNum, error: overlapReason });
            } else {
                const validItem = {
                    class_id: cls.id,
                    start_time: sessionStart,
                    end_time: sessionEnd,
                    room: roomNum,
                    topic: topicStr,
                    status: "scheduled",
                    class_name: cName,
                    teacher_email: tEmail,
                    teacher_name: teacher.full_name,
                    date: dateStr,
                    original_start: startStr,
                    original_end: endStr
                };
                validRows.push(validItem);
                activeSchedules.push({ start: tStart, end: tEnd, room: roomNum.toLowerCase(), teacher_id: teacher.id });
            }
        }

        return {
            total: rows.length,
            valid_count: validRows.length,
            invalid_count: invalidRows.length,
            validRows,
            invalidRows
        };
    },

    confirmScheduleImport: async (validRows) => {
        if (!validRows || validRows.length === 0) {
            throw new ConflictError("Không có dòng dữ liệu hợp lệ để Import");
        }
        return await ClassSession.bulkCreate(validRows);
    }
};