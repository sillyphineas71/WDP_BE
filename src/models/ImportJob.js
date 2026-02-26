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
      created_by: { type: DataTypes.UUID, allowNull: false },
      type: {
        type: DataTypes.ENUM("SCHEDULE"),
        allowNull: false,
      },
      source_file_url: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.ENUM("processing", "success", "failed"),
        allowNull: false,
        defaultValue: "processing",
      },
      result_log_file_url: { type: DataTypes.TEXT },
      summary_json: { type: DataTypes.JSON },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      finished_at: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "import_jobs",
      timestamps: false,
      indexes: [{ name: "idx_import_jobs_created_by", fields: ["created_by"] }],
    },
  );
}

export default ImportJob;
