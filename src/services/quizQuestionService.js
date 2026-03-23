// src/services/quizQuestionService.js
// UC_TEA_09: Quiz Question CRUD + AI Generation (Gemini)
import { QuizQuestion } from "../models/QuizQuestion.js";
import { QuizOption } from "../models/QuizOption.js";
import { Assessment } from "../models/Assessment.js";
import { Class } from "../models/Class.js";
import { sequelize } from "../models/index.js";
import { NotFoundError, ValidationError, AppError } from "../errors/AppError.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const recalculateQuizPoints = async (quizId, transaction) => {
    const assessment = await Assessment.findByPk(quizId, { transaction });
    if (!assessment) return;
    const maxScore = assessment.max_score || 100;
    const questionsCount = await QuizQuestion.count({ where: { assessment_id: quizId }, transaction });
    if (questionsCount === 0) return;

    const pointsPerQuestion = parseFloat((maxScore / questionsCount).toFixed(2));
    await QuizQuestion.update(
        { points: pointsPerQuestion },
        { where: { assessment_id: quizId }, transaction }
    );
};

export const quizQuestionService = {

    // ── GET all questions for a quiz ──
    getQuestions: async (quizId) => {
        const questions = await QuizQuestion.findAll({
            where: { assessment_id: quizId },
            order: [["display_order", "ASC"]],
        });

        // Manually fetch options for each question since association may not exist
        const result = [];
        for (const q of questions) {
            const options = await QuizOption.findAll({
                where: { question_id: q.id },
                order: [["display_order", "ASC"]],
            });
            result.push({
                ...q.toJSON(),
                options: options.map(o => o.toJSON()),
            });
        }
        return result;
    },

    // ── CREATE a single question ──
    createQuestion: async (quizId, data) => {
        const assessment = await Assessment.findByPk(quizId);
        if (!assessment) throw new NotFoundError("Quiz không tồn tại.");

        // Get next display_order
        const maxOrder = await QuizQuestion.max("display_order", { where: { assessment_id: quizId } });
        const nextOrder = (maxOrder || 0) + 1;

        return await sequelize.transaction(async (t) => {
            const question = await QuizQuestion.create({
                assessment_id: quizId,
                question_text: data.question_text,
                points: data.points || 1,
                display_order: nextOrder,
            }, { transaction: t });

            if (data.options && Array.isArray(data.options)) {
                const optionRecords = data.options.map((opt, idx) => ({
                    question_id: question.id,
                    option_text: opt.option_text,
                    is_correct: opt.is_correct || false,
                    display_order: idx + 1,
                }));
                await QuizOption.bulkCreate(optionRecords, { transaction: t });
            }

            // Return with options
            const options = await QuizOption.findAll({
                where: { question_id: question.id },
                order: [["display_order", "ASC"]],
                transaction: t,
            });

            await recalculateQuizPoints(quizId, t);

            return { ...question.toJSON(), options: options.map(o => o.toJSON()) };
        });
    },

    // ── UPDATE a question ──
    updateQuestion: async (questionId, data) => {
        const question = await QuizQuestion.findByPk(questionId);
        if (!question) throw new NotFoundError("Câu hỏi không tồn tại.");

        return await sequelize.transaction(async (t) => {
            await question.update({
                question_text: data.question_text,
                points: data.points,
            }, { transaction: t });

            if (data.options && Array.isArray(data.options)) {
                await QuizOption.destroy({ where: { question_id: questionId }, transaction: t });
                const optionRecords = data.options.map((opt, idx) => ({
                    question_id: questionId,
                    option_text: opt.option_text,
                    is_correct: opt.is_correct || false,
                    display_order: idx + 1,
                }));
                await QuizOption.bulkCreate(optionRecords, { transaction: t });
            }

            const options = await QuizOption.findAll({
                where: { question_id: questionId },
                order: [["display_order", "ASC"]],
                transaction: t,
            });

            return { ...question.toJSON(), options: options.map(o => o.toJSON()) };
        });
    },

    // ── DELETE a question ──
    deleteQuestion: async (questionId) => {
        const question = await QuizQuestion.findByPk(questionId);
        if (!question) throw new NotFoundError("Câu hỏi không tồn tại.");

        await sequelize.transaction(async (t) => {
            await QuizOption.destroy({ where: { question_id: questionId }, transaction: t });
            await question.destroy({ transaction: t });
            await recalculateQuizPoints(question.assessment_id, t);
        });

        return { deleted: true };
    },

    // ── UC_TEA_09: AI Generate Questions using Gemini ──
    generateAIQuestions: async (quizId, prompt, file) => {
        const assessment = await Assessment.findByPk(quizId);
        if (!assessment) throw new NotFoundError("Quiz không tồn tại.");

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new AppError("Chưa cấu hình GEMINI_API_KEY.", 500);

        let extractedText = "";
        if (file) {
            try {
                if (file.mimetype === "application/pdf") {
                    const pdfData = await pdfParse(file.buffer);
                    extractedText = pdfData.text;
                } else if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
                    const docxData = await mammoth.extractRawText({ buffer: file.buffer });
                    extractedText = docxData.value;
                } else if (file.mimetype === "text/plain") {
                    extractedText = file.buffer.toString("utf-8");
                } else {
                    throw new AppError("Định dạng file không hỗ trợ. Chỉ hỗ trợ PDF, DOCX, TXT.", 400);
                }
            } catch (err) {
                console.error("Lỗi đọc file AI:", err);
                if (err instanceof AppError) throw err;
                throw new AppError("Không thể đọc nội dung file.", 500);
            }
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
            generationConfig: { responseMimeType: "application/json" },
        });

        const systemPrompt = `Bạn là một trợ lý giáo dục chuyên soạn đề thi trắc nghiệm.
${extractedText ? `DỰA VÀO TÀI LIỆU SAU ĐÂY:\n"""\n${extractedText.substring(0, 80000)}\n"""\n\n` : ""}Yêu cầu: ${prompt}
Bài thi: "${assessment.title}"

HÃY TRẢ VỀ KẾT QUẢ DƯỚI DẠNG JSON ARRAY, mỗi phần tử gồm:
{
  "question_text": "<nội dung câu hỏi>",
  "points": 1,
  "options": [
    { "option_text": "<phương án A>", "is_correct": false },
    { "option_text": "<phương án B>", "is_correct": true },
    { "option_text": "<phương án C>", "is_correct": false },
    { "option_text": "<phương án D>", "is_correct": false }
  ]
}

Lưu ý QUAN TRỌNG VỀ TOÁN HỌC/VẬT LÝ: Nếu nội dung câu hỏi hoặc đáp án có công thức/phương trình Toán học hoặc Vật lý, BẠN PHẢI bọc các phần công thức đó bằng dấu $...$ (Ví dụ: $x^2 + y^2 = z^2$ hoặc $f(x) = \\sin(x)$) để hệ thống render LaTex hiển thị đúng trên cùng một dòng.

CHỈ trả về JSON array, không giải thích thêm.
Đảm bảo mỗi câu hỏi có đúng 1 đáp án đúng (is_correct = true).
Số lượng câu hỏi theo yêu cầu, nếu không nêu rõ thì tạo 5 câu.`;

        try {
            const result = await model.generateContent(systemPrompt);
            const responseText = result.response.text();
            const questions = JSON.parse(responseText);

            if (!Array.isArray(questions)) {
                throw new Error("AI response is not an array");
            }

            // Validate structure
            return questions.map((q, idx) => ({
                question_text: q.question_text || `Câu hỏi ${idx + 1}`,
                points: q.points || 1,
                options: (q.options || []).map(o => ({
                    option_text: o.option_text || "",
                    is_correct: !!o.is_correct,
                })),
            }));
        } catch (error) {
            console.error("AI Generation Error:", error);
            throw new AppError("AI không phản hồi đúng định dạng. Vui lòng thử lại.", 500);
        }
    },

    // ── BULK SAVE questions ──
    bulkSaveQuestions: async (quizId, questions) => {
        const assessment = await Assessment.findByPk(quizId);
        if (!assessment) throw new NotFoundError("Quiz không tồn tại.");

        const maxOrder = await QuizQuestion.max("display_order", { where: { assessment_id: quizId } });
        let order = (maxOrder || 0);

        return await sequelize.transaction(async (t) => {
            const created = [];
            for (const q of questions) {
                order++;
                const question = await QuizQuestion.create({
                    assessment_id: quizId,
                    question_text: q.question_text,
                    points: q.points || 1,
                    display_order: order,
                }, { transaction: t });

                if (q.options && Array.isArray(q.options)) {
                    const optionRecords = q.options.map((opt, idx) => ({
                        question_id: question.id,
                        option_text: opt.option_text,
                        is_correct: opt.is_correct || false,
                        display_order: idx + 1,
                    }));
                    await QuizOption.bulkCreate(optionRecords, { transaction: t });
                }

                created.push(question.toJSON());
            }
            await recalculateQuizPoints(quizId, t);
            return created;
        });
    },
};
