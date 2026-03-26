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

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".ppt", ".pptx", ".txt", ".zip", ".rar",
  ".jpg", ".jpeg", ".png", ".mp4",
]);

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

export const getTypeFromFilename = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return EXTENSION_TO_TYPE[ext] || "other";
};

export const normalizePublicMaterialUrl = (url) => {
  if (!url || typeof url !== "string") {
    return url;
  }

  let normalized = url;
  const duplicateExtensionPattern = /(\.[a-z0-9]+)\1(?=($|[?#]))/i;

  while (duplicateExtensionPattern.test(normalized)) {
    normalized = normalized.replace(duplicateExtensionPattern, "$1");
  }

  return normalized;
};

export const getPublicIdFromUrl = (url) => {
  try {
    const parts = normalizePublicMaterialUrl(url).split("/upload/");
    if (parts.length < 2) return null;
    const afterUpload = parts[1];
    const withoutVersion = afterUpload.substring(afterUpload.indexOf("/") + 1);
    return withoutVersion.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
};

export const getCloudinaryResourceTypeForPublicMaterialType = (type) => {
  if (type === "image") {
    return "image";
  }

  if (type === "video") {
    return "video";
  }

  return "raw";
};

export { cloudinary };

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "smartedu_lms/course_public_materials",
    resource_type: (_req, file) => {
      const type = getTypeFromFilename(file.originalname);
      return getCloudinaryResourceTypeForPublicMaterialType(type);
    },
    public_id: (_req, file) => {
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext);
      const safeName = name.replace(/[^a-zA-Z0-9]/g, "_");
      return `${Date.now()}-${safeName}${ext}`;
    },
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const err = new Error(
      `Dinh dang file khong duoc ho tro (${ext}). Cac dinh dang cho phep: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
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

export const uploadSinglePublicMaterialFile = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: `Dung luong file vuot qua gioi han cho phep (Toi da ${MAX_FILE_SIZE / 1024 / 1024}MB).`,
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
        message: err.message || "Loi khi upload file.",
        code: "UPLOAD_ERROR",
      });
    }

    next();
  });
};
