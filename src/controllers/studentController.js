import { studentService } from "../services/studentService.js";

export const getDashboard = async (req, res, next) => {
    try {
        const { studentId } = req.query;
        if (!studentId) return res.status(400).json({ success: false, message: "studentId is required" });
        const data = await studentService.getDashboard(studentId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export const getMyClasses = async (req, res, next) => {
    try {
        const { studentId } = req.query;
        if (!studentId) return res.status(400).json({ success: false, message: "studentId is required" });
        const data = await studentService.getMyClasses(studentId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export const getClassDetails = async (req, res, next) => {
    try {
        const { studentId } = req.query;
        if (!studentId) return res.status(400).json({ success: false, message: "studentId is required" });
        const classId = req.params.id;
        const data = await studentService.getClassDetails(studentId, classId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};
