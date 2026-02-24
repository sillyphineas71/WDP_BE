import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class AssessmentFile extends Model {}

export function initAssessmentFile(sequelize) {
  AssessmentFile.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      assessment_id: { type: DataTypes.UUID, allowNull: false },
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
      tableName: "assessment_files",
      timestamps: false,
      indexes: [
        { name: "idx_assessment_files_assessment", fields: ["assessment_id"] },
      ],
    },
  );
}

export default AssessmentFile;
