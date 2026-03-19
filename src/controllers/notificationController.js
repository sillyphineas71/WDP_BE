import {
  queueEmailNotification,
  queuePushNotification,
} from "../services/notificationService.js";
import {
  removeDeviceToken,
  saveDeviceToken,
} from "../services/pushNotificationService.js";
import {
  validateRegisterDeviceToken,
  validateRemoveDeviceToken,
  validateTestEmail,
  validateTestPush,
  validateGetNotifications,
  validateNotificationId,
} from "../validators/notificationValidator.js";
import { Notification } from "../models/index.js";

const validationErrorResponse = (res, error) => {
  const validationErrors = error.details.map((detail) => ({
    field: detail.path.join("."),
    message: detail.message,
  }));

  return res.status(400).json({
    success: false,
    message: "Validation failed",
    statusCode: 400,
    error: {
      validationErrors,
    },
  });
};

export const registerDeviceToken = async (req, res, next) => {
  try {
    const { error, value } = validateRegisterDeviceToken(req.body);

    if (error) {
      return validationErrorResponse(res, error);
    }

    const result = await saveDeviceToken({
      userId: req.user.id,
      token: value.token,
      platform: value.platform,
    });

    return res.status(200).json({
      success: true,
      message: "FCM device token registered successfully",
      statusCode: 200,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const unregisterDeviceToken = async (req, res, next) => {
  try {
    const { error, value } = validateRemoveDeviceToken(req.body);

    if (error) {
      return validationErrorResponse(res, error);
    }

    await removeDeviceToken({
      userId: req.user.id,
      token: value.token,
    });

    return res.status(200).json({
      success: true,
      message: "FCM device token removed successfully",
      statusCode: 200,
    });
  } catch (error) {
    next(error);
  }
};

export const sendTestEmail = async (req, res, next) => {
  try {
    const { error, value } = validateTestEmail(req.body);

    if (error) {
      return validationErrorResponse(res, error);
    }

    const result = await queueEmailNotification({
      to: value.to || req.user.email,
      subject: value.subject,
      html: value.html,
      text: value.text,
    });

    return res.status(200).json({
      success: true,
      message: "Email notification request accepted",
      statusCode: 200,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const sendTestPush = async (req, res, next) => {
  try {
    const { error, value } = validateTestPush(req.body);

    if (error) {
      return validationErrorResponse(res, error);
    }

    const result = await queuePushNotification({
      userId: req.user.id,
      title: value.title,
      body: value.body,
      data: value.data,
    });

    return res.status(200).json({
      success: true,
      message: "Push notification request accepted",
      statusCode: 200,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// UC_STU_13 & UC_TEA_05
export const getMyNotifications = async (req, res, next) => {
  try {
    const { error, value } = validateGetNotifications(req.query);

    if (error) {
      return validationErrorResponse(res, error);
    }

    const { page, limit, is_read } = value;
    const offset = (page - 1) * limit;

    const whereClause = {
      user_id: req.user.id,
    };

    if (is_read !== undefined) {
      whereClause.is_read = is_read;
    }

    const { count, rows } = await Notification.findAndCountAll({
      where: whereClause,
      order: [["created_at", "DESC"], ["sent_at", "DESC"]],
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      message: "Notifications retrieved successfully",
      statusCode: 200,
      data: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        notifications: rows,
      },
    });
  } catch (error) {
    if (error.name === "SequelizeDatabaseError" && error.message.includes("created_at")) {
        // Fallback incase created_at doesn't exist
        try {
          const { page, limit, is_read } = validateGetNotifications(req.query).value;
          const offset = (page - 1) * limit;
          const whereClause = { user_id: req.user.id };
          if (is_read !== undefined) {
            whereClause.is_read = is_read;
          }
          const { count, rows } = await Notification.findAndCountAll({
            where: whereClause,
            order: [["sent_at", "DESC"], ["id", "DESC"]],
            limit,
            offset,
          });
          return res.status(200).json({
            success: true,
            data: {
              totalItems: count,
              totalPages: Math.ceil(count / limit),
              currentPage: page,
              notifications: rows,
            },
          });
        } catch (fallbackError) {
          next(fallbackError);
        }
    } else {
      next(error);
    }
  }
};

export const getUnreadCount = async (req, res, next) => {
  try {
    const unreadCount = await Notification.count({
      where: {
        user_id: req.user.id,
        is_read: false,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Unread count retrieved successfully",
      statusCode: 200,
      data: {
        unread_count: unreadCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const { error, value } = validateNotificationId(req.params);

    if (error) {
      return validationErrorResponse(res, error);
    }

    const notification = await Notification.findOne({
      where: {
        id: value.id,
        user_id: req.user.id,
      },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found or access denied",
        statusCode: 404,
      });
    }

    if (!notification.is_read) {
      await notification.update({ is_read: true });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      statusCode: 200,
    });
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req, res, next) => {
  try {
    const [updatedRows] = await Notification.update(
      { is_read: true },
      {
        where: {
          user_id: req.user.id,
          is_read: false,
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      statusCode: 200,
      data: {
        updated_count: updatedRows,
      },
    });
  } catch (error) {
    next(error);
  }
};
