import express from "express";

import ClassRoutes from "./classRoutes.js";
import ClassSessionRoutes from "./classSessionRoutes.js";

const router = express.Router();

router.use("/classes", ClassRoutes);
router.use("/class-sessions", ClassSessionRoutes);

export default router;
