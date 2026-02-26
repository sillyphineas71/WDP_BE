import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class Notification extends Model {}

export function initNotification(sequelize) {
  Notification.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      channel: {
        type: DataTypes.ENUM("email", "in_app"),
        allowNull: false,
      },
      title: { type: DataTypes.TEXT, allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      scheduled_at: { type: DataTypes.DATE },
      sent_at: { type: DataTypes.DATE },
      is_read: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      ref_type: {
        type: DataTypes.ENUM("SESSION", "ASSESSMENT", "GRADE", "SYSTEM"),
      },
      ref_id: { type: DataTypes.UUID },
      status: {
        type: DataTypes.ENUM("scheduled", "sent", "failed"),
        allowNull: false,
        defaultValue: "scheduled",
      },
      error_message: { type: DataTypes.TEXT },
    },
    {
      sequelize,
      tableName: "notifications",
      timestamps: false,
      indexes: [
        { name: "idx_notifications_user", fields: ["user_id"] },
        { name: "idx_notifications_status", fields: ["status"] },
      ],
    },
  );
}

export default Notification;
