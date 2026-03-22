// src/controllers/userManagementController.js
// UC_ADM_05 → UC_ADM_09: Admin User Management Controller
import { userManagementService } from "../services/userManagementService.js";

export const userManagementController = {

    // UC_ADM_06: Xem & Tìm kiếm User
    getUsers: async (req, res, next) => {
        try {
            const { search, role, status, page, limit } = req.query;
            const data = await userManagementService.getAllUsers({ search, role, status, page, limit });
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    // UC_ADM_05: Tạo tài khoản mới
    createUser: async (req, res, next) => {
        try {
            const { email, full_name, role_code } = req.body;

            if (!email || !full_name || !role_code) {
                return res.status(400).json({
                    success: false,
                    message: "Email, Họ tên và Role là bắt buộc.",
                });
            }

            const data = await userManagementService.createUser({ email, full_name, role_code });
            res.status(201).json({ success: true, message: "Tạo tài khoản thành công.", data });
        } catch (error) {
            next(error);
        }
    },

    // UC_ADM_07: Sửa thông tin User
    updateUser: async (req, res, next) => {
        try {
            const { id } = req.params;
            const { full_name, phone } = req.body;
            const data = await userManagementService.updateUser(id, { full_name, phone });
            res.status(200).json({ success: true, message: "Cập nhật thông tin thành công.", data });
        } catch (error) {
            next(error);
        }
    },

    // UC_ADM_08: Khóa / Mở khóa User
    toggleStatus: async (req, res, next) => {
        try {
            const { id } = req.params;
            const data = await userManagementService.toggleUserStatus(id);
            const action = data.status === "blocked" ? "Khóa" : "Mở khóa";
            res.status(200).json({ success: true, message: `${action} tài khoản thành công.`, data });
        } catch (error) {
            next(error);
        }
    },

    // UC_ADM_09: Cấp lại mật khẩu
    resetPassword: async (req, res, next) => {
        try {
            const { id } = req.params;
            const data = await userManagementService.resetUserPassword(id);
            res.status(200).json({ success: true, message: "Cấp lại mật khẩu thành công.", data });
        } catch (error) {
            next(error);
        }
    },

    // ── UC_ADM_05: Bulk Import Validate (A1) ───────────────────────
    validateImport: async (req, res, next) => {
        try {
            const { rows } = req.body;
            if (!rows || !Array.isArray(rows)) {
                return res.status(400).json({ success: false, message: "Dữ liệu 'rows' không hợp lệ." });
            }
            const data = await userManagementService.validateUserImport(rows);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    // ── UC_ADM_05: Bulk Import Confirm (A1) ────────────────────────
    confirmImport: async (req, res, next) => {
        try {
            const { validRows } = req.body;
            if (!validRows || !Array.isArray(validRows)) {
                return res.status(400).json({ success: false, message: "Dữ liệu 'validRows' không hợp lệ." });
            }
            const data = await userManagementService.confirmUserImport(validRows);
            res.status(201).json({ success: true, message: `Import thành công ${data.successCount} tài khoản.`, data });
        } catch (error) {
            next(error);
        }
    },
};
