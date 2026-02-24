import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class SubmissionFile extends Model {}

export function initSubmissionFile(sequelize) {
  SubmissionFile.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      submission_id: { type: DataTypes.UUID, allowNull: false },
      file_url: { type: DataTypes.TEXT, allowNull: false },
      file_type: { type: DataTypes.TEXT },
      uploaded_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "submission_files",
      timestamps: false,
      indexes: [
        { name: "idx_submission_files_submission", fields: ["submission_id"] },
      ],
    },
  );
}

export default SubmissionFile;
