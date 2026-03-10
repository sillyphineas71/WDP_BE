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
import { Sequelize } from "sequelize";
import { ConflictError, NotFoundError } from "../errors/AppError.js";

export const adminService = {
    // --- UC_ADM_10: QUẢN LÝ KHÓA HỌC ---
    getAllCourses: async () => {
        return await Course.findAll({ order: [["created_at", "DESC"]] });
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
                { 
                    model: ClassSession, 
                    as: "sessions",
                    where: { status: { [Sequelize.Op.ne]: "cancelled" } },
                    required: false // LEFT OUTER JOIN để lấy class ngay cả khi không có session nào active
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

    // --- UC_ADM_12: PHÂN CÔNG GIẢNG VIÊN ---
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
            throw new ConflictError("Giảng viên không tồn tại hoặc không ở trạng thái Active");
        }

        // E2: Lớp học chưa có lịch
        if (!cls.sessions || cls.sessions.length === 0) {
            throw new ConflictError("Vui lòng cấu hình lịch học (Ca/Thứ) cho lớp này trước khi phân công Giảng viên.");
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
                        throw new ConflictError(`Không thể phân công. Giảng viên ${teacher.full_name} bị trùng lịch với lớp ${tClass.name}. Vui lòng chọn Giảng viên khác.`);
                    }
                }
            }
        }

        // All checks passed, assign the teacher
        return await cls.update({ teacher_id: teacherId });
    },

    // --- ADD SESSION ---
    addSession: async (classId, sessionData) => {
        const { day_of_week, start_time, end_time, room } = sessionData;
        const cls = await Class.findByPk(classId);
        if (!cls) throw new NotFoundError("Lớp học không tồn tại");

        if (!day_of_week || !start_time || !end_time) {
            throw new ConflictError("Vui lòng nhập đầy đủ thông tin: Thứ, Giờ bắt đầu, Giờ kết thúc");
        }

        const dayMap = {
            "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6
        };
        const targetDay = dayMap[day_of_week];

        let currentDate = new Date(cls.start_date);
        const endDate = new Date(cls.end_date);
        
        const sessionsToCreate = [];

        while (currentDate <= endDate) {
            if (currentDate.getDay() === targetDay) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const sessionStart = new Date(`${dateStr}T${start_time}:00`);
                const sessionEnd = new Date(`${dateStr}T${end_time}:00`);
                
                sessionsToCreate.push({
                    class_id: classId,
                    start_time: sessionStart,
                    end_time: sessionEnd,
                    room: room || "",
                    topic: `Class session`,
                    status: "scheduled"
                });
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        if (sessionsToCreate.length === 0) {
            throw new ConflictError("Khoảng thời gian của lớp học quá ngắn, không có ngày nào phù hợp");
        }

        return await ClassSession.bulkCreate(sessionsToCreate);
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
        const { sessionIds, day_of_week, start_time, end_time, room } = sessionData;
        if (!sessionIds || sessionIds.length === 0) {
            throw new ConflictError("Vui lòng cung cấp danh sách buổi học cần sửa");
        }
        
        // Strategy: To cleanly handle date shifts when day_of_week changes,
        // we delete the existing specific sessions and recreate them based on the new logic.
        // NOTE: If attendance or materials existed, this would CASCADE delete them.
        // For a more robust enterprise system, we would carefully update offsets,
        // but for this MVP, deleting and regenerating the schedule group is the cleanest approach.
        
        await adminService.deleteSessions(classId, sessionIds);
        
        // Regenerate completely new sessions for the updated schedule
        return await adminService.addSession(classId, { day_of_week, start_time, end_time, room });
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
            throw new ConflictError("Vui lòng chọn ít nhất 1 học viên để thêm vào lớp");
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
            throw new ConflictError("Một số học viên được chọn không hợp lệ hoặc không phải là học sinh kích hoạt.");
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
            throw new ConflictError("Tất cả học viên được chọn đã có trong lớp này rồi.");
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

        if (foundStudents.length === 0) {
            throw new ConflictError("Các email trong file không trùng khớp với bất kỳ học viên nào trên hệ thống.");
        }

        const studentIds = foundStudents.map(s => s.id);

        // Check if already enrolled
        const existingEnrollments = await Enrollment.findAll({
            where: {
                class_id: classId,
                user_id: { [Sequelize.Op.in]: studentIds }
            }
        });

        const existingIds = existingEnrollments.map(e => e.user_id);
        const newStudentIds = studentIds.filter(id => !existingIds.includes(id));

        if (newStudentIds.length === 0) {
            throw new ConflictError(`Tất cả ${foundStudents.length} học viên tìm thấy đã nằm trong lớp này.`);
        }

        // Create new enrollments
        const enrollmentsToCreate = newStudentIds.map(userId => ({
            class_id: classId,
            user_id: userId,
            status: "active"
        }));

        await Enrollment.bulkCreate(enrollmentsToCreate);

        return {
            total_found: foundStudents.length,
            total_imported: newStudentIds.length,
            already_enrolled: foundStudents.length - newStudentIds.length
        };
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
            throw new NotFoundError("Học viên này chưa được tham gia vào lớp học");
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
        today.setHours(0,0,0,0);
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
        let A=0, B=0, C=0, D=0, F=0;
        try {
            const [gradeRows] = await Grade.sequelize.query(
                `SELECT score FROM grades WHERE score IS NOT NULL`
            );
            gradeRows.forEach(g => {
                const score = parseFloat(g.score);
                if (score >= 9) A++;
                else if (score >= 8) B++;
                else if (score >= 7) C++;
                else if (score >= 5) D++;
                else F++;
            });
        } catch(e) {
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
             studentsByCourseData = [{ name: "No Data", students: 0 }];
        }

        // recentActivities
        const recentClasses = await Class.findAll({ order: [['created_at', 'DESC']], limit: 5 });
        const recentActivities = recentClasses.map((c, i) => ({
            id: c.id,
            action: `Class ${c.status === 'active' ? 'created' : 'updated'}`,
            details: `System - ${c.name}`,
            time: new Date(c.created_at).toLocaleDateString(),
            color: c.status === 'active' ? "bg-green-500" : "bg-blue-500"
        }));

        if (recentActivities.length === 0) {
             recentActivities.push({ id: 1, action: "System Initialization", details: "All functional", time: "Now", color: "bg-blue-500" });
        }

        return {
            statsData: { totalStudents, totalTeachers, activeClasses, submissionsToday },
            gradeDistributionData,
            studentsByCourseData,
            recentActivities
        };
    },

    getReportData: async (semester, courseCode, dateRange) => {
        let classWhere = {};
        if (semester && semester !== "All Semesters") classWhere.semester = semester;
        
        // Find course by name if it matches "CS101 - Introduction..." format or just the code
        if (courseCode && courseCode !== "All Courses") {
             const code = courseCode.split(" ")[0]; // Get the ID part
             const course = await Course.findOne({ where: { code } });
             if (course) classWhere.course_id = course.id;
        }

        // Get grades for classes that match the filter
        let whereClause = `WHERE g.score IS NOT NULL`;
        if (classWhere.semester) whereClause += ` AND cl.semester = '${classWhere.semester.replace(/'/g, "''")}'`;
        if (classWhere.course_id) whereClause += ` AND cl.course_id = '${classWhere.course_id}'`;

        let A=0, B=0, C=0, D=0, F=0;
        try {
            const [gradeRows] = await Grade.sequelize.query(`
                SELECT g.score 
                FROM grades g
                JOIN assessments a ON g.assessment_id = a.id
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
        } catch(e) {
            console.log('[Reports] Grade query error:', e.message);
        }

        const total = A+B+C+D+F || 1; // avoid /0
        const allGrades = [
            { name: `A`, pct: Math.round((A/total)*100), value: A, color: "#6366f1" },
            { name: `B`, pct: Math.round((B/total)*100), value: B, color: "#a855f7" },
            { name: `C`, pct: Math.round((C/total)*100), value: C, color: "#f43f5e" },
            { name: `D`, pct: Math.round((D/total)*100), value: D, color: "#f59e0b" },
            { name: `F`, pct: Math.round((F/total)*100), value: F, color: "#3b82f6" }
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
             courseEnrollmentData = [ {name:"No Data", students: 0} ];
        }

        // Summary stats
        const totalStudents = Object.values(courseMap).reduce((s, v) => s + v, 0);
        const gradeTotal = A+B+C+D+F;
        const passCount = A+B+C+D; // score >= 5
        const passRate = gradeTotal > 0 ? Math.round((passCount / gradeTotal) * 100) : 0;
        const aPercent = gradeTotal > 0 ? Math.round((A / gradeTotal) * 100) : 0;

        // Average grade letter
        let avgGrade = 'N/A';
        try {
            let sqlWhere = `WHERE g.score IS NOT NULL`;
            if (classWhere.semester) sqlWhere += ` AND cl.semester = '${classWhere.semester.replace(/'/g, "''")}'`;
            if (classWhere.course_id) sqlWhere += ` AND cl.course_id = '${classWhere.course_id}'`;
            const [avgRows] = await Grade.sequelize.query(`
                SELECT AVG(g.score::numeric) as avg_score
                FROM grades g
                JOIN assessments a ON g.assessment_id = a.id
                JOIN classes cl ON a.class_id = cl.id
                ${sqlWhere}
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
        } catch(e) {}

        return {
            gradeDistributionData: allGrades.map(g => ({ name: g.name, students: g.value })),
            gradePercentageData,
            courseEnrollmentData,
            summaryStats: {
                avgGrade,
                passRate,
                totalStudents,
                aStudents: A,
                gradeTotal,
                aPercent
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
            order: [['code', 'ASC']]
        });

        return { semesters, courses };
    },

    getTeacherActivity: async (semester, course, dateRange) => {
        // Build date range filter
        const dateRangeMap = {
            'This Week':     `NOW() - INTERVAL '7 days'`,
            'This Month':    `DATE_TRUNC('month', NOW())`,
            'This Semester': `NOW() - INTERVAL '6 months'`,
            'Custom Range':  `NOW() - INTERVAL '28 days'`,
        };
        const dateFrom = dateRangeMap[dateRange] || `DATE_TRUNC('month', NOW())`;

        // Number of time buckets (weeks) based on range
        const numBuckets = (dateRange === 'This Week') ? 7 : 4;
        const bucketInterval = (dateRange === 'This Week') ? `1 day` : `7 days`;
        const totalInterval = (dateRange === 'This Week') ? `7 days` : `28 days`;
        const bucketLabel = (dateRange === 'This Week') ? 'Day' : 'Week';

        // Build class filter clauses
        let semClause = '';
        let courseClause = '';
        if (semester && semester.trim()) {
            semClause = `AND cl.semester = '${semester.replace(/'/g, "''")}'`;
        }
        if (course && course.trim()) {
            // course is formatted as "CODE - Name"
            const courseCode = course.split(' - ')[0].trim();
            courseClause = `AND c2.code = '${courseCode.replace(/'/g, "''")}'`;
        }

        const dayStep = (dateRange === 'This Week') ? 1 : 7;
        const buildBucketCase = (col, table) => {
            // Generate CASE WHEN from highest bucket down, each bucket covers dayStep days
            const whenClauses = [];
            for (let i = numBuckets; i >= 2; i--) {
                const daysAgo = (numBuckets - i + 1) * dayStep;
                whenClauses.push(`WHEN ${table}.${col} >= NOW() - INTERVAL '${daysAgo} days' THEN ${i}`);
            }
            return `CASE ${whenClauses.join(' ')} ELSE 1 END`;
        };

        let weeklyRows = [];
        try {
            const [rows] = await Grade.sequelize.query(`
                SELECT week_num,
                    SUM(quizzes)::int AS quizzes,
                    SUM(materials)::int AS materials,
                    SUM(graded)::int AS graded
                FROM (
                    SELECT
                        ${buildBucketCase('created_at', 'a')} AS week_num,
                        COUNT(*)::int AS quizzes, 0 AS materials, 0 AS graded
                    FROM assessments a
                    JOIN classes cl ON a.class_id = cl.id
                    JOIN courses c2 ON cl.course_id = c2.id
                    WHERE a.created_at >= NOW() - INTERVAL '${totalInterval}'
                        AND UPPER(a.assessment_type::text) = 'QUIZ'
                        ${semClause} ${courseClause}
                    GROUP BY week_num
                    UNION ALL
                    SELECT
                        ${buildBucketCase('created_at', 'm')} AS week_num,
                        0 AS quizzes, COUNT(*)::int AS materials, 0 AS graded
                    FROM materials m
                    JOIN classes cl ON m.class_id = cl.id
                    JOIN courses c2 ON cl.course_id = c2.id
                    WHERE m.created_at >= NOW() - INTERVAL '${totalInterval}'
                        ${semClause} ${courseClause}
                    GROUP BY week_num
                    UNION ALL
                    SELECT
                        ${buildBucketCase('graded_at', 'g')} AS week_num,
                        0 AS quizzes, 0 AS materials, COUNT(*)::int AS graded
                    FROM grades g
                    JOIN assessments a ON g.assessment_id = a.id
                    JOIN classes cl ON a.class_id = cl.id
                    JOIN courses c2 ON cl.course_id = c2.id
                    WHERE g.graded_at >= NOW() - INTERVAL '${totalInterval}'
                        AND g.graded_at IS NOT NULL
                        ${semClause} ${courseClause}
                    GROUP BY week_num
                ) combined
                GROUP BY week_num
                ORDER BY week_num
            `);
            weeklyRows = rows;
        } catch (err) {
            console.error('[getTeacherActivity] weekly query error:', err.message);
            console.error('[getTeacherActivity] SQL params:', { semester, course, dateRange, semClause, courseClause });
        }

        // Build N-bucket chart data
        const chartMap = {};
        for (let i = 1; i <= numBuckets; i++) chartMap[i] = { quizzes: 0, materials: 0, graded: 0 };
        weeklyRows.forEach(r => {
            const w = parseInt(r.week_num);
            if (chartMap[w]) {
                chartMap[w].quizzes += r.quizzes || 0;
                chartMap[w].materials += r.materials || 0;
                chartMap[w].graded += r.graded || 0;
            }
        });
        const activityChartData = Array.from({ length: numBuckets }, (_, i) => ({
            name: `${bucketLabel} ${i + 1}`,
            quizzesCreated: chartMap[i + 1].quizzes,
            materialsUploaded: chartMap[i + 1].materials,
            assignmentsGraded: chartMap[i + 1].graded
        }));

        // Total counts for the date range — all safe with fallback
        let total_quizzes = 0, total_materials = 0, total_graded = 0;
        try {
            const [[r]] = await Grade.sequelize.query(`
                SELECT COUNT(a.id)::int as total_quizzes
                FROM assessments a
                JOIN classes cl ON a.class_id = cl.id
                JOIN courses c2 ON cl.course_id = c2.id
                WHERE UPPER(a.assessment_type::text) = 'QUIZ'
                  AND a.created_at >= ${dateFrom}
                  ${semClause} ${courseClause}
            `);
            total_quizzes = r?.total_quizzes || 0;
        } catch(e) { console.error('[getTeacherActivity] quizzes count error:', e.message); }

        try {
            const [[r]] = await Grade.sequelize.query(`
                SELECT COUNT(m.id)::int as total_materials
                FROM materials m
                JOIN classes cl ON m.class_id = cl.id
                JOIN courses c2 ON cl.course_id = c2.id
                WHERE m.created_at >= ${dateFrom}
                  ${semClause} ${courseClause}
            `);
            total_materials = r?.total_materials || 0;
        } catch(e) { console.error('[getTeacherActivity] materials count error:', e.message); }

        try {
            const [[r]] = await Grade.sequelize.query(`
                SELECT COUNT(g.id)::int as total_graded
                FROM grades g
                JOIN assessments a ON g.assessment_id = a.id
                JOIN classes cl ON a.class_id = cl.id
                JOIN courses c2 ON cl.course_id = c2.id
                WHERE g.graded_at IS NOT NULL
                  AND g.graded_at >= ${dateFrom}
                  ${semClause} ${courseClause}
            `);
            total_graded = r?.total_graded || 0;
        } catch(e) { console.error('[getTeacherActivity] graded count error:', e.message); }

        return {
            activityChartData,
            bucketLabel,
            totals: {
                quizzesCreated:    total_quizzes    || 0,
                materialsUploaded: total_materials  || 0,
                assignmentsGraded: total_graded     || 0
            }
        };
    }
};