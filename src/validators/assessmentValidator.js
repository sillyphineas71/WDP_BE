// src/validators/assessmentValidator.js
import Joi from "joi";

export const createEssaySchema = Joi.object({
  title: Joi.string().required().messages({
    "any.required": "Vui lòng nhập Tiêu đề bài tập.",
    "string.empty": "Vui lòng nhập Tiêu đề bài tập.",
  }),
  instructions: Joi.string().allow("", null),
  
  // Thời gian
  allow_from: Joi.date().iso().allow(null),
  due_at: Joi.date().iso().allow(null),
  cutoff_at: Joi.date().iso().allow(null),
  
  // Thang điểm (Mặc định 100)
  max_score: Joi.number().min(0).default(100),
  
  // Trạng thái (A1: Lưu nháp hoặc Hiển thị)
  status: Joi.string().valid("draft", "published").default("published"),
  
  // Cấu hình định dạng nộp bài (Lưu vào cột settings_json)
  settings: Joi.object({
    online_text: Joi.boolean().default(false), // Cho phép gõ văn bản trực tiếp
    file_submission: Joi.boolean().default(true), // Cho phép nộp file
    max_files: Joi.number().integer().min(1).max(20).default(1),
    max_size_mb: Joi.number().min(1).default(5),
    allowed_exts: Joi.array().items(Joi.string()).default([".pdf", ".docx", ".zip", ".rar"])
  }).default(),

  // File đính kèm đề bài
  files: Joi.array().items(
    Joi.object({
      file_url: Joi.string().required(),
      original_name: Joi.string().required(),
      mime_type: Joi.string().required(),
    })
  ).optional(),
});