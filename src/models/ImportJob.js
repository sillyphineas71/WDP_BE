import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class ImportJob extends Model {}

export function initImportJob(sequelize) {
  ImportJob.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      class_id: { type: DataTypes.UUID },
      file_name: { type: DataTypes.TEXT, allowNull: false },
      import_type: {
        type: DataTypes.ENUM("users", "classes", "enrollments"),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("pending", "processing", "completed", "failed"),
        allowNull: false,
        defaultValue: "pending",
      },
      success_count: { type: DataTypes.INTEGER, defaultValue: 0 },
      error_count: { type: DataTypes.INTEGER, defaultValue: 0 },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "import_jobs",
      timestamps: false,
      indexes: [
        { name: "idx_import_jobs_user", fields: ["user_id"] },
        { name: "idx_import_jobs_class", fields: ["class_id"] },
      ],
    },
  );
}

export default ImportJob;
