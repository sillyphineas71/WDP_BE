import express from "express";
import { isAuth } from "../middleware/isAuth.js";
import {
  registerDeviceToken,
  sendTestEmail,
  sendTestPush,
  unregisterDeviceToken,
} from "../controllers/notificationController.js";

const router = express.Router();

router.use(isAuth);

router.post("/device-token", registerDeviceToken);
router.delete("/device-token", unregisterDeviceToken);
router.post("/test-email", sendTestEmail);
router.post("/test-push", sendTestPush);

export default router;
