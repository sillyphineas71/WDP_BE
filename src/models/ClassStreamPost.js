import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class ClassStreamPost extends Model {}

export function initClassStreamPost(sequelize) {
  ClassStreamPost.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      class_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      author_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      post_type: {
        type: DataTypes.ENUM("announcement", "discussion", "question", "resource"),
        allowNull: false,
        defaultValue: "discussion",
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      allow_comments: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      is_pinned: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      status: {
        type: DataTypes.ENUM("active", "hidden", "deleted"),
        allowNull: false,
        defaultValue: "active",
      },
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
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "class_stream_posts",
      timestamps: false,
      indexes: [
        { name: "idx_stream_posts_class", fields: ["class_id"] },
        { name: "idx_stream_posts_author", fields: ["author_id"] },
        { name: "idx_stream_posts_status", fields: ["status"] },
        { name: "idx_stream_posts_created", fields: ["created_at"] },
        { name: "idx_stream_posts_class_created", fields: ["class_id", "created_at"] },
        { name: "idx_stream_posts_class_pinned_created", fields: ["class_id", "is_pinned", "created_at"] },
      ],
    },
  );
}

export default ClassStreamPost;