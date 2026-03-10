// src/middleware/upload.js
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import "dotenv/config";

// 1. Cấu hình xác thực với Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Cấu hình nơi lưu trữ (Storage)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "smartedu_lms/assignments", // Thư mục sẽ tự động được tạo trên Cloudinary
    resource_type: "auto", // Bắt buộc là "auto" để cho phép upload file PDF, Word, Zip...
    public_id: (req, file) => {
      // Bỏ đuôi file cũ để Cloudinary tự gắn lại, tránh lỗi tên file có 2 lần đuôi (VD: tailieu.pdf.pdf)
      const name = file.originalname.split(".")[0]; 
      // Xóa khoảng trắng và ký tự đặc biệt trong tên file cho an toàn
      const safeName = name.replace(/[^a-zA-Z0-9]/g, "_");
      return `${Date.now()}-${safeName}`;
    },
  },
});

// 3. Khởi tạo multer với storage của Cloudinary, giới hạn dung lượng 20MB/file
export const upload = multer({ 
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 } // 20 MB
});