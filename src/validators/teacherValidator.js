import Joi from "joi";

export const createQuizSchema = Joi.object({
    title: Joi.string().trim().min(1).required().messages({
        "any.required": "Vui lòng nhập tên bài kiểm tra",
        "string.empty": "Vui lòng nhập tên bài kiểm tra",
        "string.min": "Vui lòng nhập tên bài kiểm tra",
    }),

    instructions: Joi.string().allow("", null),

    // Timing
    timeLimitMinutes: Joi.number().integer().positive().allow(null),

    // Grade & Behavior
    attemptLimit: Joi.number().integer().min(0).allow(null), // 0 => unlimited
    gradeMethod: Joi.string()
        .valid("highest", "average", "last")
        .default("highest"),

    shuffleQuestions: Joi.boolean().default(false),

    // Review options
    reviewOption: Joi.string()
        .valid("after_submit", "after_close")
        .default("after_submit"),

    // Open/Close time (UC E2)
    openAt: Joi.date().iso().allow(null),
    closeAt: Joi.date().iso().allow(null),
})
    .custom((value, helpers) => {
        if (value.openAt && value.closeAt) {
            const open = new Date(value.openAt).getTime();
            const close = new Date(value.closeAt).getTime();
            if (close <= open) {
                return helpers.error("any.custom");
            }
        }
        return value;
    })
    .messages({
        "any.custom": "Thời gian kết thúc phải diễn ra sau thời gian bắt đầu",
    });

export const validateCreateQuiz = (data) =>
    createQuizSchema.validate(data, { abortEarly: false, stripUnknown: true });

export const createAssignmentSchema = Joi.object({
    title: Joi.string().trim().min(1).required().messages({
        "any.required": "Vui lòng nhập tên bài tập",
        "string.empty": "Vui lòng nhập tên bài tập",
        "string.min": "Vui lòng nhập tên bài tập",
    }),

    instructions: Joi.string().allow("", null),

    // Allowed submission formats
    submissionTypes: Joi.array().items(Joi.string().valid("online_text", "file")).min(1).default(["file"]),

    // Max files and sizes
    maxFiles: Joi.number().integer().min(1).default(1),
    maxFileSizeMB: Joi.number().integer().min(1).default(5),
    allowedFileTypes: Joi.array().items(Joi.string()).default([]), // Empty array means any file type

    // Grading
    maxScore: Joi.number().min(0).default(10),
    
    // Status (e.g. Save as Draft)
    status: Joi.string().valid("draft", "published").default("published"),

    // Open/Close time (UC E2)
    openAt: Joi.date().iso().allow(null),
    closeAt: Joi.date().iso().allow(null),
    cutOffAt: Joi.date().iso().allow(null), // Trễ nộp
})
    .custom((value, helpers) => {
        if (value.openAt && value.closeAt) {
            const open = new Date(value.openAt).getTime();
            const close = new Date(value.closeAt).getTime();
            if (close <= open) {
                return helpers.message("Thời gian hạn nộp (Due Date) phải diễn ra sau thời gian bắt đầu (Open Date)");
            }
        }
        if (value.closeAt && value.cutOffAt) {
            const close = new Date(value.closeAt).getTime();
            const cutoff = new Date(value.cutOffAt).getTime();
            if (cutoff < close) {
                return helpers.message("Thời gian đóng cổng (Cut-off Date) không được trước hạn nộp (Due Date)");
            }
        }
        return value;
    });

export const validateCreateAssignment = (data) =>
    createAssignmentSchema.validate(data, { abortEarly: false, stripUnknown: true });

export const publishGradesSchema = Joi.object({
    is_published: Joi.boolean().required().messages({
        "any.required": "Trạng thái công bố (is_published) là bắt buộc",
        "boolean.base": "Trạng thái công bố phải là true hoặc false"
    })
});

export const validatePublishGrades = (data) =>
    publishGradesSchema.validate(data, { abortEarly: false, stripUnknown: true });