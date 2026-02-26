import { adminService } from "../services/adminService.js";

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
    editClass: async (req, res, next) => {
        try {
            const data = await adminService.updateClass(req.params.id, req.body);
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    }
};