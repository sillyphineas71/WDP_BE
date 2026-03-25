import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

const ALLOWED_TYPES = [
  "pdf",
  "doc",
  "spreadsheet",
  "slide",
  "image",
  "video",
  "archive",
  "text",
  "other",
];

const ALLOWED_STATUSES = ["active", "archived"];

export class CoursePublicMaterial extends Model {}

export function initCoursePublicMaterial(sequelize) {
  CoursePublicMaterial.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
        field: "id",
      },
      course_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "course_id",
      },
      uploaded_by: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "uploaded_by",
      },
      type: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: "type",
        validate: {
          isIn: [ALLOWED_TYPES],
        },
      },
      title: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: "title",
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "description",
      },
      file_url: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: "file_url",
      },
      original_filename: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "original_filename",
      },
      file_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "file_size",
        validate: {
          min: 0,
        },
      },
      is_visible: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: "is_visible",
      },
      status: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: "active",
        field: "status",
        validate: {
          isIn: [ALLOWED_STATUSES],
        },
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "created_at",
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "updated_at",
      },
    },
    {
      sequelize,
      tableName: "course_public_materials",
      timestamps: false,
      indexes: [
        { name: "idx_course_public_materials_course_id", fields: ["course_id"] },
        {
          name: "idx_course_public_materials_course_visibility",
          fields: ["course_id", "status", "is_visible"],
        },
        { name: "idx_course_public_materials_uploaded_by", fields: ["uploaded_by"] },
      ],
    },
  );
}

export default CoursePublicMaterial;
