import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class ClassStreamAttachment extends Model {}

export function initClassStreamAttachment(sequelize) {
  ClassStreamAttachment.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      post_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      comment_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      file_url: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      original_name: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      storage_key: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      mime_type: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      file_type: {
        type: DataTypes.ENUM("image", "document", "archive", "audio", "video", "other"),
        allowNull: false,
      },
      file_size: {
        type: DataTypes.BIGINT,
        allowNull: false,
        validate: {
          min: 0,
        },
      },
      storage_provider: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "cloudinary",
      },
      uploaded_by: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "class_stream_attachments",
      timestamps: false,
      indexes: [
        { name: "idx_stream_attachments_post", fields: ["post_id"] },
        { name: "idx_stream_attachments_comment", fields: ["comment_id"] },
        { name: "idx_stream_attachments_uploaded_by", fields: ["uploaded_by"] },
        { name: "idx_stream_attachments_file_type", fields: ["file_type"] },
      ],
      validate: {
        exactlyOneOwner() {
          const hasPostId = Boolean(this.post_id);
          const hasCommentId = Boolean(this.comment_id);
          if (hasPostId === hasCommentId) {
            throw new Error("Exactly one of post_id or comment_id must be provided");
          }
        },
      },
    },
  );
}

export default ClassStreamAttachment;