import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { UnauthorizedError } from "../errors/AppError.js";
import { ERROR_MESSAGES } from "../constants/messages.js";

/**
 * Middleware to verify JWT token and attach user info to request
 * Usage: Use this middleware on protected routes
 * Example: router.get("/protected", isAuth, handleRequest)
 */
export const isAuth = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      throw new UnauthorizedError(ERROR_MESSAGES.TOKEN_REQUIRED);
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key",
    );

    // Get user from database with role
    const user = await User.findByPk(decoded.id, {
      include: [
        {
          model: Role,
          as: "role",
          attributes: ["id", "code", "name"],
        },
      ],
    });

    if (!user) {
      throw new UnauthorizedError(ERROR_MESSAGES.INVALID_TOKEN);
    }

    // Check if user is blocked
    if (user.status === "blocked") {
      throw new UnauthorizedError(ERROR_MESSAGES.USER_BLOCKED);
    }

    // Attach user and role to request
    req.user = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role.code,
      roleId: user.role_id,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError("Token has expired"));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new UnauthorizedError(ERROR_MESSAGES.INVALID_TOKEN));
    }
    next(error);
  }
};

/**
 * Middleware to check if user has specific role(s)
 * Usage: Use this middleware after isAuth to restrict access by role
 * Example: router.get("/admin", isAuth, authorize("ADMIN"), handleRequest)
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError(ERROR_MESSAGES.UNAUTHORIZED));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new UnauthorizedError(ERROR_MESSAGES.UNAUTHORIZED));
    }

    next();
  };
};
