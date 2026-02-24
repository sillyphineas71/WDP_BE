import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class PasswordResetToken extends Model {}

export function initPasswordResetToken(sequelize) {
  PasswordResetToken.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      token_hash: { type: DataTypes.TEXT, allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      used_at: { type: DataTypes.DATE },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    { sequelize, tableName: "password_reset_tokens", timestamps: false },
  );
}

export default PasswordResetToken;
