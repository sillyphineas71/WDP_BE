import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class ClassSession extends Model {}

export function initClassSession(sequelize) {
  ClassSession.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      class_id: { type: DataTypes.UUID, allowNull: false },
      start_time: { type: DataTypes.DATE, allowNull: false },
      end_time: { type: DataTypes.DATE, allowNull: false },
      room: { type: DataTypes.TEXT },
      topic: { type: DataTypes.TEXT },
      status: {
        type: DataTypes.ENUM("scheduled", "cancelled", "done"),
        allowNull: false,
        defaultValue: "scheduled",
      },
      cancelled_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      cancelled_reason: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    },
    {
      sequelize,
      tableName: "class_sessions",
      timestamps: false,
      indexes: [{ name: "idx_class_sessions_class", fields: ["class_id"] }],
    },
  );
}

export default ClassSession;
