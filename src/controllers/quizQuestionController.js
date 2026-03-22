// src/controllers/quizQuestionController.js
// UC_TEA_09: Quiz Question CRUD + AI Generation Controller
import { quizQuestionService } from "../services/quizQuestionService.js";

export const quizQuestionController = {

    getQuestions: async (req, res, next) => {
        try {
            const { quizId } = req.params;
            const data = await quizQuestionService.getQuestions(quizId);
            res.status(200).json({ success: true, code: 200, data });
        } catch (error) {
            next(error);
        }
    },

    createQuestion: async (req, res, next) => {
        try {
            const { quizId } = req.params;
            const data = await quizQuestionService.createQuestion(quizId, req.body);
            res.status(201).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    updateQuestion: async (req, res, next) => {
        try {
            const { questionId } = req.params;
            const data = await quizQuestionService.updateQuestion(questionId, req.body);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    deleteQuestion: async (req, res, next) => {
        try {
            const { questionId } = req.params;
            const data = await quizQuestionService.deleteQuestion(questionId);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    generateAIQuestions: async (req, res, next) => {
        try {
            const { quizId } = req.params;
            const { prompt } = req.body;
            const file = req.file;

            if (!prompt || !prompt.trim()) {
                return res.status(400).json({ success: false, message: "Vui lòng nhập yêu cầu cho AI." });
            }

            const data = await quizQuestionService.generateAIQuestions(quizId, prompt, file);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    bulkSaveQuestions: async (req, res, next) => {
        try {
            const { quizId } = req.params;
            const { questions } = req.body;

            if (!questions || !Array.isArray(questions) || questions.length === 0) {
                return res.status(400).json({ success: false, message: "Danh sách câu hỏi không hợp lệ." });
            }

            const data = await quizQuestionService.bulkSaveQuestions(quizId, questions);
            res.status(201).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },
};
