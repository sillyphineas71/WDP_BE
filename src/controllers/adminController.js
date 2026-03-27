import { adminService } from "../services/adminService.js";
import { reportExportService } from "../services/reportExportService.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";

export const adminController = {
    // Course Handlers
    getCourses: async (req, res, next) => {
        try {
            const { page, limit, q, status } = req.query;
            const data = await adminService.getAllCourses({ page, limit, q, status });
            res.status(200).json({ success: true, ...data });
        } catch (error) { next(error); }
    },
    addCourse: async (req, res, next) => {
        try {
            const data = await adminService.createCourse(req.body);
            res.status(201).json({ success: true, data });
        } catch (error) { next(error); }
    },
    editCourse: async (req, res, next) => {
        try {
            const data = await adminService.updateCourse(req.params.id, req.body);
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    },
    removeCourse: async (req, res, next) => {
        try {
            await adminService.deleteCourse(req.params.id);
            res.status(200).json({ success: true, message: "Deleted" });
        } catch (error) { next(error); }
    },
    validateCourseImport: async (req, res, next) => {
        try {
            const { rows } = req.body;
            const data = await adminService.validateCourseImport(rows);
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    },
    confirmCourseImport: async (req, res, next) => {
        try {
            const { validRows } = req.body;
            await adminService.confirmCourseImport(validRows);
            res.status(201).json({ success: true, message: "Import khóa học thành công" });
        } catch (error) { next(error); }
    },

    // Class Handlers
    getClasses: async (req, res, next) => {
        try {
            const { page, limit, q, statusFilter } = req.query;
            const data = await adminService.getAllClasses({ page, limit, q, statusFilter });
            res.status(200).json({ success: true, ...data });
        } catch (error) { next(error); }
    },
    getClassById: async (req, res, next) => {
        try {
            const data = await adminService.getClassDetail(req.params.id);
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    },
    addClass: async (req, res, next) => {
        try {
            const data = await adminService.createClass(req.body);
            res.status(201).json({ success: true, data });
        } catch (error) { next(error); }
    },
    getCreatePage: async (req, res, next) => {
        try {
            // Lấy danh sách các khóa học để người dùng chọn trong Form
            const courses = await adminService.getAllCourses(); 
            const teachers = await adminService.getAllTeachers();

            res.status(200).json({ 
                success: true, 
                data: { courses, teachers } 
            });
        } catch (error) { next(error); }
    },
    editClass: async (req, res, next) => {
        try {
            const data = await adminService.updateClass(req.params.id, req.body);
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    },
    upgradeClass: async (req, res, next) => {
        try {
            const data = await adminService.upgradeClass(req.params.id, req.body);
            res.status(201).json({ success: true, message: "Lên lớp thành công", data });
        } catch (error) { next(error); }
    },
    validateClassImport: async (req, res, next) => {
        try {
            const { rows } = req.body;
            const data = await adminService.validateClassImport(rows);
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    },
    confirmClassImport: async (req, res, next) => {
        try {
            const { validRows } = req.body;
            const data = await adminService.confirmClassImport(validRows);
            res.status(201).json({ success: true, message: "Import lớp học thành công", data });
        } catch (error) { next(error); }
    },

    // Teacher Handlers
    getTeachers: async (req, res, next) => {
        try {
            const data = await adminService.getAllTeachers();
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    },
    assignTeacher: async (req, res, next) => {
        try {
            const { teacher_id } = req.body; // Can be null for unassign
            const data = await adminService.assignTeacher(req.params.id, teacher_id);
            res.status(200).json({ success: true, message: "Phân công thành công", data });
        } catch (error) { next(error); }
    },
    addSession: async (req, res, next) => {
        try {
            const data = await adminService.addSession(req.params.id, req.body);
            res.status(201).json({ success: true, message: "Class sessions generated successfully", data });
        } catch (error) { next(error); }
    },
    editSessions: async (req, res, next) => {
        try {
            const data = await adminService.editSessions(req.params.id, req.body);
            res.status(200).json({ success: true, message: "Class sessions updated successfully", data });
        } catch (error) { next(error); }
    },
    updateSession: async (req, res, next) => {
        try {
            const data = await adminService.updateSession(req.params.id, req.params.sessionId, req.body);
            res.status(200).json({ success: true, message: "Class session updated successfully", data });
        } catch (error) { next(error); }
    },
    deleteSessions: async (req, res, next) => {
        try {
            await adminService.deleteSessions(req.params.id, req.body.sessionIds);
            res.status(200).json({ success: true, message: "Class sessions deleted successfully" });
        } catch (error) { next(error); }
    },

    // --- STUDENTS ---
    getStudents: async (req, res, next) => {
        try {
            const data = await adminService.getAllStudents();
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    },
    enrollStudents: async (req, res, next) => {
        try {
            const data = await adminService.enrollStudents(req.params.id, req.body.studentIds);
            res.status(201).json({ success: true, message: "Students enrolled successfully", data });
        } catch (error) { next(error); }
    },
    importStudents: async (req, res, next) => {
        try {
            const result = await adminService.importStudents(req.params.id, req.body.emails);
            res.status(201).json({ 
                success: true, 
                message: `Đã nhập thành công ${result.total_imported} học sinh vào lớp.`, 
                data: result 
            });
        } catch (error) { next(error); }
    },
    validateStudentImport: async (req, res, next) => {
        try {
            const data = await adminService.validateStudentImport(req.params.id, req.body.rows);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },
    confirmStudentImport: async (req, res, next) => {
        try {
            const data = await adminService.confirmStudentImport(req.params.id, req.body.validRows);
            res.status(201).json({ success: true, data, message: "Import thành công!" });
        } catch (error) {
            next(error);
        }
    },
    unenrollStudent: async (req, res, next) => {
        try {
            await adminService.unenrollStudent(req.params.id, req.params.studentId);
            res.status(200).json({ success: true, message: "Học sinh đã được xóa khỏi lớp" });
        } catch (error) { next(error); }
    },

    // --- DASHBOARD & REPORTS ---
    getDashboardStats: async (req, res, next) => {
        try {
            const data = await adminService.getDashboardStats();
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    },
    getReportData: async (req, res, next) => {
        try {
            const { semester, course, dateRange, class_id, startDate, endDate } = req.query;
            const data = await adminService.getReportData(semester, course, dateRange, class_id, startDate, endDate);
            res.status(200).json({ success: true, data, heartbeat: 'v1_fixed' });
        } catch (error) { next(error); }
    },
    getReportFilters: async (req, res, next) => {
        try {
            const data = await adminService.getReportFilters();
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    },
    getTeacherActivity: async (req, res, next) => {
        try {
            const { semester, course, dateRange, class_id, startDate, endDate } = req.query;
            const data = await adminService.getTeacherActivity(semester, course, dateRange, class_id, startDate, endDate);
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    },
    exportReportPDF: async (req, res, next) => {
        try {
            const { semester, course, dateRange, class_id, className, activeTab, startDate, endDate } = req.query;
            console.log('PDF Export Request - activeTab:', activeTab, 'Filters:', { semester, course, dateRange, class_id, className, startDate, endDate });
            
            // Set headers EARLY to prevent CORS blocking by download managers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/pdf');
            const filename = `baocao_${activeTab || 'chung'}_${new Date().getTime()}.pdf`;
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

            let teacherActivityData = null;
            if (activeTab === 'teacher') {
                teacherActivityData = await adminService.getTeacherActivity(semester, course, dateRange, class_id, startDate, endDate);
            }

            const reportData = await adminService.getReportData(semester, course, dateRange, class_id, startDate, endDate);
            const doc = await reportExportService.generateReportPDF(reportData, { semester, course, dateRange, className, activeTab, startDate, endDate }, teacherActivityData);
            
            doc.pipe(res);
            doc.end();
        } catch (error) { next(error); }
    },

    // --- SCHEDULE IMPORT ---
    validateScheduleImport: async (req, res, next) => {
        try {
            const { rows } = req.body;
            const data = await adminService.validateScheduleImport(rows);
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    },
    confirmScheduleImport: async (req, res, next) => {
        try {
            const { validRows } = req.body;
            await adminService.confirmScheduleImport(validRows);
            res.status(201).json({ success: true, message: "Import lịch học thành công" });
        } catch (error) { next(error); }
    },
    seedDebugData: async (req, res, next) => {
        try {
            const data = await adminService.seedDebugData();
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    }
};