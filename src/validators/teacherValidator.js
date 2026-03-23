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

    // Grading
    max_score: Joi.number().min(0).default(10),
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
    }),
    // UC_TEA_15 Bước 4-5: Chọn đối tượng công bố
    // "graded_only" = Chỉ những SV đã được chấm điểm
    // "all_students" = Toàn bộ SV (kể cả chưa nộp -> 0 điểm)
    publish_mode: Joi.string()
        .valid("graded_only", "all_students")
        .default("graded_only")
        .messages({
            "any.only": "publish_mode phải là 'graded_only' hoặc 'all_students'"
        })
});

export const validatePublishGrades = (data) =>
    publishGradesSchema.validate(data, { abortEarly: false, stripUnknown: true });

// UC_TEA_13: Override question score
export const overrideQuestionScoreSchema = Joi.object({
    new_score: Joi.number().min(0).required().messages({
        "any.required": "Điểm mới (new_score) là bắt buộc",
        "number.base": "Điểm mới phải là một số",
        "number.min": "Điểm mới không được âm"
    }),
    reason: Joi.string().trim().min(1).required().messages({
        "any.required": "Lý do chỉnh sửa (reason) là bắt buộc",
        "string.empty": "Lý do chỉnh sửa không được để trống"
    })
});

export const validateOverrideScore = (data) =>
    overrideQuestionScoreSchema.validate(data, { abortEarly: false, stripUnknown: true });

// ================================================================
// UC_TEA_09: Soạn câu hỏi Quiz (Quiz Question CRUD)
// ================================================================

const quizOptionSchema = Joi.object({
    option_text: Joi.string().trim().min(1).required().messages({
        "any.required": "Nội dung phương án trả lời là bắt buộc",
        "string.empty": "Nội dung phương án không được để trống"
    }),
    is_correct: Joi.boolean().required().messages({
        "any.required": "Phải chỉ định đáp án đúng/sai (is_correct)"
    }),
    display_order: Joi.number().integer().min(1).required()
});

export const createQuizQuestionSchema = Joi.object({
    question_text: Joi.string().trim().min(1).required().messages({
        "any.required": "Nội dung câu hỏi là bắt buộc",
        "string.empty": "Nội dung câu hỏi không được để trống"
    }),
    points: Joi.number().min(0).required().messages({
        "any.required": "Điểm câu hỏi (points) là bắt buộc",
        "number.min": "Điểm không được âm"
    }),
    display_order: Joi.number().integer().min(1).allow(null),
    options: Joi.array().items(quizOptionSchema).min(2).required().messages({
        "array.min": "Câu hỏi phải có ít nhất 2 phương án trả lời",
        "any.required": "Danh sách phương án trả lời (options) là bắt buộc"
    })
}).custom((value, helpers) => {
    // E3: Kiểm tra phải có ít nhất 1 đáp án đúng
    const hasCorrect = value.options.some(o => o.is_correct === true);
    if (!hasCorrect) {
        return helpers.error("any.custom");
    }
    return value;
}).messages({
    "any.custom": "Phải có ít nhất 1 đáp án đúng được chọn"
});

export const validateCreateQuizQuestion = (data) =>
    createQuizQuestionSchema.validate(data, { abortEarly: false, stripUnknown: true });

export const updateQuizQuestionSchema = Joi.object({
    question_text: Joi.string().trim().min(1).messages({
        "string.empty": "Nội dung câu hỏi không được để trống"
    }),
    points: Joi.number().min(0),
    display_order: Joi.number().integer().min(1),
    options: Joi.array().items(quizOptionSchema).min(2).messages({
        "array.min": "Câu hỏi phải có ít nhất 2 phương án trả lời"
    })
}).custom((value, helpers) => {
    if (value.options) {
        const hasCorrect = value.options.some(o => o.is_correct === true);
        if (!hasCorrect) {
            return helpers.error("any.custom");
        }
    }
    return value;
}).messages({
    "any.custom": "Phải có ít nhất 1 đáp án đúng được chọn"
});

export const validateUpdateQuizQuestion = (data) =>
    updateQuizQuestionSchema.validate(data, { abortEarly: false, stripUnknown: true });

// Bulk create (Normal Flow bước 8: Lưu vào đề - nhiều câu cùng lúc)
export const bulkCreateQuizQuestionsSchema = Joi.object({
    questions: Joi.array().items(createQuizQuestionSchema).min(1).required().messages({
        "array.min": "Phải có ít nhất 1 câu hỏi",
        "any.required": "Danh sách câu hỏi (questions) là bắt buộc"
    })
});

export const validateBulkCreateQuizQuestions = (data) =>
    bulkCreateQuizQuestionsSchema.validate(data, { abortEarly: false, stripUnknown: true });

// UC_TEA_09 Normal Flow: Tạo bằng AI
export const generateAiQuizSchema = Joi.object({
    prompt: Joi.string().trim().min(5).required().messages({
        "any.required": "Vui lòng nhập yêu cầu cho AI (Prompt)",
        "string.empty": "Yêu cầu cho AI không được để trống",
        "string.min": "Yêu cầu phải có ít nhất 5 ký tự"
    }),
    num_questions: Joi.number().integer().min(1).max(50).default(10),
    file_urls: Joi.array().items(Joi.string().uri()).default([])
});

export const validateGenerateAiQuiz = (data) =>
    generateAiQuizSchema.validate(data, { abortEarly: false, stripUnknown: true });