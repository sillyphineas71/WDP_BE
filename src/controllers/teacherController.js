// src/controllers/teacherController.js
import { teacherService } from "../services/teacherService.js";
import { createEssaySchema } from "../validators/assessmentValidator.js";

// --- API: TẠO BÀI TẬP ---
export const createEssayAssessment = async (req, res, next) => {
  try {
    // Validate dữ liệu đầu vào (Bắt Exception E1)
    const { error, value } = createEssaySchema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const validationErrors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));
      return res.status(400).json({
        success: false,
        message: "Dữ liệu không hợp lệ",
        statusCode: 400,
        errors: validationErrors,
      });
    }

    const teacherId = req.user.id; 
    const classId = req.params.classId;

    // Gọi Service
    const data = await teacherService.createEssayAssessment(teacherId, classId, value);

    // Postconditions: Trả về thành công
    res.status(201).json({
      success: true,
      message: value.status === 'draft' ? "Đã lưu nháp bài tập." : "Tạo bài tập tự luận thành công.",
      data,
    });
  } catch (err) {
    next(err);
  }
};

// --- API: LẤY DANH SÁCH BÀI TẬP CỦA LỚP ---
export const getAssignmentsByClass = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const classId = req.params.classId;

    const data = await teacherService.getAssignmentsByClass(teacherId, classId);

    res.status(200).json({
      success: true,
      data: data,
    });
  } catch (error) {
    next(error);
  }
};

// --- API: LẤY DANH SÁCH LỚP DẠY CỦA GIẢNG VIÊN ---
export const getMyClasses = async (req, res, next) => {
    try {
        const data = await teacherService.getMyClasses(req.user.id);
        res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
};

// --- API: CẬP NHẬT BÀI TẬP (A2) ---
export const updateEssayAssessment = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { classId, assessmentId } = req.params;
    const data = req.body;

    // Gọi xuống service để thực hiện logic update
    const updatedAssessment = await teacherService.updateEssayAssessment(
      teacherId, 
      classId, 
      assessmentId, 
      data
    );

    res.status(200).json({
      success: true,
      message: "Cập nhật bài tập thành công",
      data: updatedAssessment,
    });
  } catch (error) {
    next(error); // Chuyển lỗi cho middleware xử lý lỗi (AppError)
  }
};

export const deleteAssessment = async (req, res, next) => {
  try {
    const { assessmentId } = req.params;
    await teacherService.deleteAssessment(req.user.id, assessmentId);
    res.status(200).json({ success: true, message: "Xóa bài tập thành công" });
  } catch (error) { next(error); }
};

export const getSubmissionsByAssessment = async (req, res, next) => {
    try {
        const teacherId = req.user.id;
        const assessmentId = req.params.assessmentId;

        // Gọi xuống Service để lấy dữ liệu bài nộp
        const data = await teacherService.getSubmissionsByAssessment(teacherId, assessmentId);

        res.status(200).json({
            success: true,
            message: "Lấy danh sách bài nộp thành công",
            data: data
        });
    } catch (error) {
        next(error); // Bắt lỗi (ví dụ: NotFoundError nếu bài tập không tồn tại)
    }
};

export const getSubmissionForGrading = async (req, res) => {
    try {
        const { submissionId } = req.params;
        // Gọi Service mình đã viết lúc nãy
        const submission = await teacherService.getSubmissionForGrading(submissionId);
        
        res.status(200).json({
            success: true,
            data: submission
        });
    } catch (error) {
        console.error("Lỗi getSubmissionForGrading:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const gradeSubmission = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const teacherId = req.user.id; // Lấy ID giáo viên từ token
        const gradeData = req.body;

        // Gọi Service lưu điểm
        const grade = await teacherService.gradeSubmission(teacherId, submissionId, gradeData);
        
        res.status(200).json({
            success: true,
            message: "Đã lưu điểm thành công",
            data: grade
        });
    } catch (error) {
        console.error("Lỗi gradeSubmission:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};