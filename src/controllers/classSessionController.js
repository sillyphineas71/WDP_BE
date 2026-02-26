import * as service from "../services/classSessionService.js";

export const createManualClassSession = async (req, res, next) => {
  try {
    const adminId = req.user?.id;
    const data = await service.createManualClassSession(adminId, {
      class_id: req.params.classId,
      ...req.body,
    });
    res.status(201).json({ message: "Đã lưu lịch học thành công", data });
  } catch (e) {
    next(e);
  }
};

export const updateManualClassSession = async (req, res, next) => {
  try {
    const adminId = req.user?.id;
    const data = await service.updateManualClassSession(
      adminId,
      req.params.sessionId,
      req.body,
    );
    res.status(200).json({ message: "Đã lưu lịch học thành công", data });
  } catch (e) {
    next(e);
  }
};

export const cancelManualClassSession = async (req, res, next) => {
  try {
    const adminId = req.user?.id;
    const data = await service.cancelManualClassSession(
      adminId,
      req.params.sessionId,
      req.body?.reason,
    );
    res.status(200).json({ message: "Đã hủy buổi học thành công", data });
  } catch (e) {
    next(e);
  }
};
