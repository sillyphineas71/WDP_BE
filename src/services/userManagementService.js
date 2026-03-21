// src/services/userManagementService.js
// UC_ADM_05 → UC_ADM_09: Admin User Management
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Sequelize } from "sequelize";
import { ConflictError, NotFoundError } from "../errors/AppError.js";
import { hashPassword } from "../utils/passwordUtils.js";
import crypto from "crypto";
import { sendEmail } from "./emailService.js";

/**
 * Generate a random password (8 chars, alphanumeric)
 */
function generateRandomPassword(length = 8) {
    return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

export const userManagementService = {

    // ── UC_ADM_06: Xem & Tìm kiếm User ──────────────────────────
    getAllUsers: async ({ search, role, status, page = 1, limit = 20 }) => {
        const where = {};
        const include = [{ model: Role, as: "role", attributes: ["id", "code", "name"] }];

        // Filter by role code (ADMIN / TEACHER / STUDENT)
        if (role && role !== "all") {
            include[0].where = { code: role.toUpperCase() };
        }

        // Filter by status (active / blocked)
        if (status && status !== "all") {
            where.status = status;
        }

        // Search by name or email
        if (search && search.trim()) {
            const q = `%${search.trim().toLowerCase()}%`;
            where[Sequelize.Op.or] = [
                Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("full_name")), { [Sequelize.Op.like]: q }),
                Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("email")), { [Sequelize.Op.like]: q }),
            ];
        }

        const offset = (page - 1) * limit;

        const { count, rows } = await User.findAndCountAll({
            where,
            include,
            attributes: ["id", "email", "full_name", "phone", "status", "created_at"],
            order: [["created_at", "DESC"]],
            limit: Number(limit),
            offset,
        });

        return {
            users: rows,
            total: count,
            page: Number(page),
            totalPages: Math.ceil(count / limit),
        };
    },

    // ── UC_ADM_05: Tạo tài khoản mới ─────────────────────────────
    createUser: async ({ email, full_name, role_code }) => {
        // 1. Check trùng email
        const existing = await User.findOne({
            where: Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("email")), email.toLowerCase()),
        });
        if (existing) {
            throw new ConflictError("Email đã tồn tại trong hệ thống.");
        }

        // 2. Tìm Role
        const role = await Role.findOne({ where: { code: role_code.toUpperCase() } });
        if (!role) {
            throw new NotFoundError("Role không hợp lệ.");
        }

        // 3. Sinh mật khẩu ngẫu nhiên
        const rawPassword = generateRandomPassword();
        const password_hash = await hashPassword(rawPassword);

        // 4. Tạo user
        const user = await User.create({
            email: email.toLowerCase(),
            full_name,
            role_id: role.id,
            password_hash,
            status: "active",
            must_change_password: true,
        });

        // 5. Gửi email thông báo tài khoản mới
        try {
            await sendEmail({
                to: email,
                subject: "[SmartEdu] Thông báo Tài khoản mới được tạo ✔",
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                        <h2 style="color: #2563eb; text-align: center;">Chào mừng đến với SmartEdu</h2>
                        <p>Xin chào <strong>${full_name}</strong>,</p>
                        <p>Tài khoản của bạn đã được khởi tạo thành công trên hệ thống SmartEdu.</p>
                        <hr style="border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                        <p><strong>Thông tin Đăng nhập vào Hệ thống:</strong></p>
                        <p style="background-color: #f8fafc; padding: 10px; border-radius: 6px; font-family: sans-serif; font-size: 14px; line-height: 1.6;">
                            <strong>• Tài khoản (Email):</strong> ${email}<br />
                            <strong>• Mật khẩu:</strong> <span style="color: #059669; font-weight: bold;">${rawPassword}</span>
                        </p>
                        <p style="font-size: 12px; color: #64748b; font-style: italic;">* Vui lòng đổi mật khẩu trong lần đăng nhập đầu tiên để bảo mật tài khoản.</p>
                        <p style="text-align: center; margin-top: 25px;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="background-color: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">Truy cập ngay</a>
                        </p>
                    </div>
                `
            });
        } catch (mailError) {
            console.error(`❌ [CreateUser] Lỗi gửi email tới ${email}:`, mailError);
        }

        return {
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                role: role.code,
                status: user.status,
            },
            generated_password: rawPassword, // Trả về cho admin xem
        };
    },

    // ── UC_ADM_07: Sửa thông tin User ─────────────────────────────
    updateUser: async (userId, { full_name, phone }) => {
        const user = await User.findByPk(userId);
        if (!user) throw new NotFoundError("User không tồn tại.");

        const updateData = {};
        if (full_name !== undefined) updateData.full_name = full_name;
        if (phone !== undefined) updateData.phone = phone;
        updateData.updated_at = new Date();

        await user.update(updateData);

        return await User.findByPk(userId, {
            attributes: ["id", "email", "full_name", "phone", "status"],
            include: [{ model: Role, as: "role", attributes: ["code", "name"] }],
        });
    },

    // ── UC_ADM_08: Khóa / Mở khóa User ───────────────────────────
    toggleUserStatus: async (userId) => {
        const user = await User.findByPk(userId, {
            include: [{ model: Role, as: "role", attributes: ["code"] }],
        });
        if (!user) throw new NotFoundError("User không tồn tại.");

        const newStatus = user.status === "active" ? "blocked" : "active";
        await user.update({ status: newStatus, updated_at: new Date() });

        return {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            status: newStatus,
            role: user.role.code,
        };
    },

    // ── UC_ADM_09: Cấp lại mật khẩu ──────────────────────────────
    resetUserPassword: async (userId) => {
        const user = await User.findByPk(userId);
        if (!user) throw new NotFoundError("User không tồn tại.");

        const rawPassword = generateRandomPassword();
        const password_hash = await hashPassword(rawPassword);

        await user.update({
            password_hash,
            must_change_password: true,
            updated_at: new Date(),
        });

        console.log(`\n🔑 [UC_ADM_09] Cấp lại mật khẩu:`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Mật khẩu mới: ${rawPassword}\n`);

        return {
            id: user.id,
            email: user.email,
            generated_password: rawPassword,
        };
    },

    // ── UC_ADM_05: Bulk Import (A1) ──────────────────────────────────
    validateUserImport: async (rows) => {
        const validRows = [];
        const invalidRows = [];
        const roles = await Role.findAll();
        const roleCodes = roles.map(r => r.code.toUpperCase());

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const email = row.Email?.trim() || "";
            const full_name = row["Họ tên"]?.trim() || "";
            let role_code = row["Vai trò"]?.trim()?.toUpperCase() || "";

            // Map tiếng Việt sang Code hệ thống
            if (role_code === "GIÁO VIÊN" || role_code === "GIAO VIEN") role_code = "TEACHER";
            if (role_code === "HỌC SINH" || role_code === "HOC SINH" || role_code === "HỌC VIÊN" || role_code === "HOC VIEN") role_code = "STUDENT";

            if (!email || !full_name || !role_code) {
                invalidRows.push({ rowNumber: i + 1, email, full_name, reason: "Thiếu trường dữ liệu bắt buộc (Email, Họ tên, Vai trò)." });
                continue;
            }

            if (!roleCodes.includes(role_code)) {
                invalidRows.push({ rowNumber: i + 1, email, full_name, reason: `Vai trò "${role_code}" không hợp lệ. Chỉ chấp nhận: ${roleCodes.join(", ")}.` });
                continue;
            }

            const existing = await User.findOne({
                where: Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("email")), email.toLowerCase())
            });
            if (existing) {
                invalidRows.push({ rowNumber: i + 1, email, full_name, reason: "Email đã tồn tại trong hệ thống." });
                continue;
            }

            validRows.push({ email, full_name, role_code });
        }

        return { validRows, invalidRows };
    },

    confirmUserImport: async (validRows) => {
        let successCount = 0;
        const failures = [];

        const rolesList = await Role.findAll();
        const roleMap = {};
        rolesList.forEach(r => roleMap[r.code.toUpperCase()] = r.id);

        for (const row of validRows) {
            try {
                const rawPassword = generateRandomPassword();
                const password_hash = await hashPassword(rawPassword);

                await User.create({
                    email: row.email.toLowerCase(),
                    full_name: row.full_name,
                    role_id: roleMap[row.role_code],
                    password_hash,
                    status: "active",
                    must_change_password: true,
                });

                // Gửi email
                try {
                    await sendEmail({
                        to: row.email,
                        subject: "[SmartEdu] Thông báo Tài khoản mới được tạo ✔",
                        html: `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                                <h2 style="color: #2563eb; text-align: center;">Chào mừng đến với SmartEdu</h2>
                                <p>Xin chào <strong>${row.full_name}</strong>,</p>
                                <p>Tài khoản của bạn đã được khởi tạo thành công trên hệ thống SmartEdu.</p>
                                <hr style="border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                                <p><strong>Thông tin Đăng nhập vào Hệ thống:</strong></p>
                                <p style="background-color: #f8fafc; padding: 10px; border-radius: 6px; font-family: sans-serif; font-size: 14px; line-height: 1.6;">
                                    <strong>• Tài khoản (Email):</strong> ${row.email}<br />
                                    <strong>• Mật khẩu:</strong> <span style="color: #059669; font-weight: bold;">${rawPassword}</span>
                                </p>
                                <p style="font-size: 12px; color: #64748b; font-style: italic;">* Vui lòng đổi mật khẩu trong lần đăng nhập đầu tiên để bảo mật tài khoản.</p>
                                <p style="text-align: center; margin-top: 25px;">
                                    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="background-color: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">Truy cập ngay</a>
                                </p>
                            </div>
                        `
                    });
                } catch (mailError) {
                    console.error(`❌ [ImportUser] Lỗi gửi email tới ${row.email}:`, mailError);
                }

                successCount++;
            } catch (error) {
                failures.push({ email: row.email, reason: error.message });
            }
        }

        return { successCount, failures };
    },
};
