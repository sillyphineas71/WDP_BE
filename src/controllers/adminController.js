import { adminService } from "../services/adminService.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";

export const adminController = {
    // Course Handlers
    getCourses: async (req, res, next) => {
        try {
            const data = await adminService.getAllCourses();
            res.status(200).json({ success: true, data });
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

    // Class Handlers
    getClasses: async (req, res, next) => {
        try {
            const data = await adminService.getAllClasses();
            res.status(200).json({ success: true, data });
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
                message: `Đã nhập thành công ${result.total_imported} học viên vào lớp.`, 
                data: result 
            });
        } catch (error) { next(error); }
    },
    unenrollStudent: async (req, res, next) => {
        try {
            await adminService.unenrollStudent(req.params.id, req.params.studentId);
            res.status(200).json({ success: true, message: "Học viên đã được xóa khỏi lớp" });
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
            const { semester, course, dateRange } = req.query;
            const data = await adminService.getReportData(semester, course, dateRange);
            res.status(200).json({ success: true, data });
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
            const { semester, course, dateRange } = req.query;
            const data = await adminService.getTeacherActivity(semester, course, dateRange);
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    }
};