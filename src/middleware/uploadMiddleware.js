// src/middleware/uploadMiddleware.js
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import path from "path";
import "dotenv/config";

// ──── Cloudinary config (tái sử dụng env đã setup) ────

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ──── Hằng số ────

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (E1)

// BR_DOC_01: Extension cho phép
const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".ppt", ".pptx", ".txt", ".zip", ".rar",
  ".jpg", ".jpeg", ".png", ".mp4",
]);

// Mapping extension → material type
const EXTENSION_TO_TYPE = {
  ".pdf": "pdf",
  ".doc": "doc", ".docx": "doc",
  ".xls": "spreadsheet", ".xlsx": "spreadsheet",
  ".ppt": "slide", ".pptx": "slide",
  ".txt": "text",
  ".zip": "archive", ".rar": "archive",
  ".jpg": "image", ".jpeg": "image", ".png": "image",
  ".mp4": "video",
};

/**
 * Suy ra material type từ extension.
 */
export const getTypeFromFilename = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return EXTENSION_TO_TYPE[ext] || "other";
};

/**
 * Trích xuất Cloudinary public_id từ URL.
 * URL: https://res.cloudinary.com/.../upload/v123/smartedu_lms/materials/1710-Slide.pdf
 * → public_id: smartedu_lms/materials/1710-Slide
 */
export const getPublicIdFromUrl = (url) => {
  try {
    const parts = url.split("/upload/");
    if (parts.length < 2) return null;
    const afterUpload = parts[1]; // "v123/smartedu_lms/materials/1710-Slide.pdf"
    const withoutVersion = afterUpload.substring(afterUpload.indexOf("/") + 1);
    const publicId = withoutVersion.replace(/\.[^/.]+$/, ""); // bỏ extension
    return publicId;
  } catch {
    return null;
  }
};

// Export cloudinary instance để dùng trong service (destroy)
export { cloudinary };

// ──── CloudinaryStorage cho materials ────

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "smartedu_lms/materials",
    resource_type: "auto", // hỗ trợ PDF, Word, Zip, Video...
    public_id: (req, file) => {
      // Đảm bảo public_id luôn có đuôi file. Với file raw (như PDF, DOC, ZIP)
      // Cloudinary KHÔNG tự gắn đuôi, nên nếu lột bỏ đuôi sẽ gây lỗi không mở được file khi tải về.
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext);
      const safeName = name.replace(/[^a-zA-Z0-9]/g, "_");
      return `${Date.now()}-${safeName}${ext}`;
    },
  },
});

// ──── File filter (BR_DOC_01) ────

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
 */
export const uploadSingleFile = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: `Dung lượng file vượt quá giới hạn cho phép (Tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB).`,
          code: "FILE_TOO_LARGE",
        });
      }
      if (err.code === "INVALID_FILE_TYPE" || err.statusCode === 400) {
        return res.status(400).json({
          success: false,
          message: err.message,
          code: "INVALID_FILE_TYPE",
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || "Lỗi khi upload file.",
        code: "UPLOAD_ERROR",
      });
    }
    next();
  });
};
