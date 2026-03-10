// src/controllers/classQueryController.js
import { listClassesWithCourse } from "../services/classQueryService.js";

export const getClassesWithCourse = async (req, res, next) => {
  try {
    const data = await listClassesWithCourse(req.query);
    res.status(200).json({ message: "OK", ...data });
  } catch (e) {
    next(e);
  }
};
