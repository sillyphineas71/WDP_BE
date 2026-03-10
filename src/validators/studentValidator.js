import Joi from "joi";

const uuid = Joi.string().guid({ version: "uuidv4" });

export const saveAnswerSchema = Joi.object({
    selectedOptionId: uuid.allow(null),
    selectedOptionIds: Joi.array().items(uuid).min(1).allow(null),
    answerText: Joi.string().allow("", null),
})
    .custom((value, helpers) => {
        const hasSingle = !!value.selectedOptionId;
        const hasMulti = Array.isArray(value.selectedOptionIds) && value.selectedOptionIds.length > 0;
        const hasText = typeof value.answerText === "string" && value.answerText.trim().length > 0;

        if (!hasSingle && !hasMulti && !hasText) {
            return helpers.error("any.custom");
        }
        return value;
    })
    .messages({
        "any.custom": "Phải chọn đáp án hoặc nhập câu trả lời",
    });

export const validateSaveAnswer = (data) =>
    saveAnswerSchema.validate(data, { abortEarly: false, stripUnknown: true });