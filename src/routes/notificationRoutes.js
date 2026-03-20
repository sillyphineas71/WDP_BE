import express from "express";
import { isAuth } from "../middleware/isAuth.js";
import {
  registerDeviceToken,
  sendTestEmail,
  sendTestPush,
  unregisterDeviceToken,
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "../controllers/notificationController.js";

const router = express.Router();

router.use(isAuth);

router.post("/device-token", registerDeviceToken);
router.delete("/device-token", unregisterDeviceToken);
router.post("/test-email", sendTestEmail);
router.post("/test-push", sendTestPush);

// UC_STU_13 & UC_TEA_05 Endpoints
router.get("/", getMyNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllAsRead);
router.patch("/:id/read", markAsRead);

export default router;
