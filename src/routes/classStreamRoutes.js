import express from "express";
import { isAuth } from "../middleware/isAuth.js";
import { uploadStreamFiles } from "../middleware/streamUploadMiddleware.js";
import {
  createStreamCommentHandler,
  createStreamPostHandler,
  deleteStreamCommentHandler,
  deleteStreamPostHandler,
  getClassStreamHandler,
  getStreamCommentsHandler,
  getStreamPostDetailHandler,
  setStreamPostCommentPolicyHandler,
  setStreamPostPinnedHandler,
  updateStreamCommentHandler,
  updateStreamPostHandler,
} from "../controllers/classStreamController.js";

const router = express.Router();

router.use(isAuth);

router.get("/classes/:classId/stream", getClassStreamHandler);
router.get("/classes/:classId/stream/posts/:postId", getStreamPostDetailHandler);
router.post("/classes/:classId/stream/posts", uploadStreamFiles, createStreamPostHandler);
router.patch("/classes/:classId/stream/posts/:postId", uploadStreamFiles, updateStreamPostHandler);
router.delete("/classes/:classId/stream/posts/:postId", deleteStreamPostHandler);
router.patch("/classes/:classId/stream/posts/:postId/pin", setStreamPostPinnedHandler);
router.patch(
  "/classes/:classId/stream/posts/:postId/comment-policy",
  setStreamPostCommentPolicyHandler,
);

router.get("/classes/:classId/stream/posts/:postId/comments", getStreamCommentsHandler);
router.post(
  "/classes/:classId/stream/posts/:postId/comments",
  uploadStreamFiles,
  createStreamCommentHandler,
);
router.patch(
  "/classes/:classId/stream/comments/:commentId",
  uploadStreamFiles,
  updateStreamCommentHandler,
);
router.delete("/classes/:classId/stream/comments/:commentId", deleteStreamCommentHandler);

export default router;

