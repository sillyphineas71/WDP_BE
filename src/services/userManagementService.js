// src/services/userManagementService.js
// UC_ADM_05 → UC_ADM_09: Admin User Management
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Sequelize } from "sequelize";
import { ConflictError, NotFoundError } from "../errors/AppError.js";
import { hashPassword } from "../utils/passwordUtils.js";
import crypto from "crypto";

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

        // 5. Log password (thay cho gửi email trong giai đoạn dev)
        console.log(`\n📧 [UC_ADM_05] Tài khoản mới được tạo:`);
        console.log(`   Email: ${email}`);
        console.log(`   Mật khẩu: ${rawPassword}\n`);

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
};
