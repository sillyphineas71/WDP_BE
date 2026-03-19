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
} from "../validators/notificationValidator.js";

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
