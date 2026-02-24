import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class AttendanceRecord extends Model {}

export function initAttendanceRecord(sequelize) {
  AttendanceRecord.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      class_session_id: { type: DataTypes.UUID, allowNull: false },
      attendance_status: {
        type: DataTypes.ENUM("present", "absent", "late", "excused"),
        allowNull: false,
      },
      recorded_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "attendance_records",
      timestamps: false,
      indexes: [
        { name: "idx_attendance_records_user", fields: ["user_id"] },
        {
          name: "idx_attendance_records_session",
          fields: ["class_session_id"],
        },
        {
          name: "idx_attendance_records_user_session",
          fields: ["user_id", "class_session_id"],
          unique: true,
        },
      ],
    },
  );
}

export default AttendanceRecord;
