import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { hashPassword, comparePassword } from "../utils/passwordUtils.js";
import {
    NotFoundError,
    UnauthorizedError,
} from "../errors/AppError.js";
import { ERROR_MESSAGES } from "../constants/messages.js";

const formatUserProfile = (user) => {
    return {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        avatar_url: user.avatar_url,
        bio: user.bio,
        status: user.status,
        role: user.role ? user.role.code : undefined,
        created_at: user.created_at,
    };
};

export const getUserProfile = async (userId) => {
    const user = await User.findByPk(userId, {
        include: [
            {
                model: Role,
                as: "role",
                attributes: ["id", "code", "name"],
            },
        ],
    });

    if (!user) {
        throw new NotFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    return formatUserProfile(user);
};

export const updateUserProfile = async (userId, updateData) => {
    const user = await User.findByPk(userId, {
        include: [
            {
                model: Role,
                as: "role",
                attributes: ["id", "code", "name"],
            },
        ],
    });

    if (!user) {
        throw new NotFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Update allowed fields
    const allowedFields = ["full_name", "phone", "avatar_url", "bio"];

    for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
            user[field] = updateData[field];
        }
    }

    user.updated_at = new Date();
    await user.save();

    return formatUserProfile(user);
};

export const changeUserPassword = async (userId, oldPassword, newPassword) => {
    const user = await User.findByPk(userId);

    if (!user) {
        throw new NotFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Verify old password
    const isMatch = await comparePassword(oldPassword, user.password_hash);
    if (!isMatch) {
        throw new UnauthorizedError(ERROR_MESSAGES.INCORRECT_OLD_PASSWORD);
    }

    // Hash new password
    user.password_hash = await hashPassword(newPassword);
    user.password_changed_at = new Date();
    user.updated_at = new Date();

    await user.save();
};
