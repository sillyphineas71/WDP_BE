import { getClassChatResponse } from "../services/aiAssistantService.js";
import { Enrollment } from "../models/index.js";
import { AppError } from "../errors/AppError.js";

export const chatWithClassAI = async (req, res, next) => {
    try {
        const { classId } = req.params;
        const { message, history } = req.body;
        const studentId = req.user.id;

        // 1. Verify Enrollment
        const enrollment = await Enrollment.findOne({
            where: { class_id: classId, user_id: studentId }
        });

        if (!enrollment) {
            throw new AppError("Bạn không có quyền truy cập vào trợ lý AI của lớp học này.", 403);
        }

        if (!message || message.trim() === "") {
            return res.status(400).json({ success: false, message: "Tin nhắn không được để trống." });
        }

        // 2. Call AI Service
        const response = await getClassChatResponse({
            classId,
            message,
            history: history || []
        });

        return res.status(200).json({
            success: true,
            data: response
        });

    } catch (error) {
        next(error);
    }
};
