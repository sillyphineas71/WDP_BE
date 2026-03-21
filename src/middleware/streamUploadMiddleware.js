import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import path from "path";
import "dotenv/config";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 10;

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".zip",
  ".rar",
  ".7z",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".mp4",
  ".mov",
  ".avi",
  ".mp3",
  ".wav",
  ".m4a",
]);

const inferResourceType = (mimetype = "") => {
  if (mimetype.startsWith("image/")) {
    return "image";
  }

  if (mimetype.startsWith("video/") || mimetype.startsWith("audio/")) {
    return "video";
  }

  return "raw";
};

const storage = new CloudinaryStorage({
  cloudinary,
  params: (_req, file) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const safeName = baseName.replace(/[^a-zA-Z0-9_-]/g, "_");

    return {
      folder: "smartedu_lms/stream",
      resource_type: inferResourceType(file.mimetype),
      public_id: `${Date.now()}-${safeName}${ext}`,
    };
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const err = new Error(
      `Định dạng file không được hỗ trợ (${ext}).`,
    );
    err.statusCode = 400;
    err.code = "INVALID_STREAM_FILE_TYPE";
    return cb(err, false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
});

export const uploadStreamFiles = (req, res, next) => {
  upload.array("files", MAX_FILES)(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: `Dung lượng mỗi tệp không được vượt quá ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
        statusCode: 400,
        error: {
          code: "FILE_TOO_LARGE",
        },
      });
    }

    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: `Chỉ được tải tối đa ${MAX_FILES} tệp trong một lần.`,
        statusCode: 400,
        error: {
          code: "TOO_MANY_FILES",
        },
      });
    }

    if (err.code === "INVALID_STREAM_FILE_TYPE" || err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: err.message,
        statusCode: 400,
        error: {
          code: "INVALID_STREAM_FILE_TYPE",
        },
      });
    }

    return res.status(400).json({
      success: false,
      message: err.message || "Lỗi khi tải tệp Stream.",
      statusCode: 400,
      error: {
        code: "STREAM_UPLOAD_ERROR",
      },
    });
  });
};

export const getCloudinaryResourceTypeForAttachment = (fileType) => {
  if (fileType === "image") {
    return "image";
  }

  if (["audio", "video"].includes(fileType)) {
    return "video";
  }

  return "raw";
};

export { cloudinary };

