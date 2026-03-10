// src/routes/uploadRoutes.js
import express from "express";
import { upload } from "../middleware/upload.js";

const router = express.Router();

// Cho phép upload tối đa 5 file cùng lúc, với tên field là "files" (Khớp với FormData ở FE)
router.post("/", upload.array("files", 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "Không có file nào được tải lên." });
    }

    // Mapping lại thông tin file để trả về cho Frontend
    const uploadedFiles = req.files.map((file) => ({
      file_url: file.path, // Đây là link URL Public trực tiếp từ Cloudinary
      original_name: file.originalname,
      mime_type: file.mimetype,
    }));

    res.status(200).json({ success: true, data: uploadedFiles });
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    res.status(500).json({ success: false, message: "Lỗi xử lý file trên máy chủ." });
  }
});

export default router;