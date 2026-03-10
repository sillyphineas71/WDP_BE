// src/middleware/uploadMiddleware.js
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

// ──── Cấu hình ────

const UPLOAD_DIR = "uploads/materials";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (E1)

// BR_DOC_01: Danh sách extension cho phép
const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".zip",
  ".rar",
  ".jpg",
  ".jpeg",
  ".png",
  ".mp4",
]);

// Mapping extension → material type
const EXTENSION_TO_TYPE = {
  ".pdf": "pdf",
  ".doc": "doc",
  ".docx": "doc",
  ".xls": "spreadsheet",
  ".xlsx": "spreadsheet",
  ".ppt": "slide",
  ".pptx": "slide",
  ".txt": "text",
  ".zip": "archive",
  ".rar": "archive",
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".mp4": "video",
};

/**
 * Suy ra material type từ extension.
 * @param {string} filename
 * @returns {string}
 */
export const getTypeFromFilename = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return EXTENSION_TO_TYPE[ext] || "other";
};

// ──── Multer config ────

// Đảm bảo thư mục upload tồn tại
const ensureUploadDir = () => {
  const fullPath = path.resolve(UPLOAD_DIR);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}-${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const err = new Error(
      `Định dạng file không được hỗ trợ (${ext}). Các định dạng cho phép: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
    );
    err.statusCode = 400;
    err.code = "INVALID_FILE_TYPE";
    return cb(err, false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

/**
 * Middleware upload 1 file (field name = "file").
 * Xử lý lỗi multer trả về response 400 rõ ràng.
 */
export const uploadSingleFile = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      // Multer file size error
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: `Dung lượng file vượt quá giới hạn cho phép (Tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB). Vui lòng nén file hoặc sử dụng link Google Drive/OneDrive.`,
          code: "FILE_TOO_LARGE",
        });
      }

      // Custom file type error
      if (err.code === "INVALID_FILE_TYPE" || err.statusCode === 400) {
        return res.status(400).json({
          success: false,
          message: err.message,
          code: "INVALID_FILE_TYPE",
        });
      }

      // Other multer errors
      return res.status(400).json({
        success: false,
        message: err.message || "Lỗi khi upload file.",
        code: "UPLOAD_ERROR",
      });
    }

    next();
  });
};
