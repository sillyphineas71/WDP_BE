// src/controllers/studentController.js
import { studentService } from "../services/studentService.js";

// Đã sửa: Lấy studentId từ req.user.id thay vì req.query
export const getDashboard = async (req, res, next) => {
    try {
        const studentId = req.user.id; 
        const data = await studentService.getDashboard(studentId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export const getMyClasses = async (req, res, next) => {
    try {
        const studentId = req.user.id; 
        const data = await studentService.getMyClasses(studentId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export const getClassDetails = async (req, res, next) => {
    try {
        const studentId = req.user.id; 
        const classId = req.params.id;
        const data = await studentService.getClassDetails(studentId, classId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export const getAssignmentDetail = async (req, res, next) => {
    try {
        const studentId = req.user.id; 
        const data = await studentService.getAssignmentDetail(studentId, req.params.assessmentId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export const submitAssignment = async (req, res, next) => {
    try {
        const studentId = req.user.id; 
        const data = await studentService.submitAssignment(studentId, req.params.assessmentId, req.body);
        res.status(200).json({ success: true, message: "Thao tác nộp bài thành công", data });
    } catch (error) {
        next(error);
    }
};