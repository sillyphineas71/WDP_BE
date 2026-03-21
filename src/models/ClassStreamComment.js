import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class ClassStreamComment extends Model {}

export function initClassStreamComment(sequelize) {
  ClassStreamComment.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      post_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      author_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      parent_comment_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: true,
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
      tableName: "class_stream_comments",
      timestamps: false,
      indexes: [
        { name: "idx_stream_comments_post", fields: ["post_id"] },
        { name: "idx_stream_comments_author", fields: ["author_id"] },
        { name: "idx_stream_comments_parent", fields: ["parent_comment_id"] },
        { name: "idx_stream_comments_status", fields: ["status"] },
        { name: "idx_stream_comments_created", fields: ["created_at"] },
        { name: "idx_stream_comments_post_created", fields: ["post_id", "created_at"] },
        { name: "uq_stream_comments_id_post", unique: true, fields: ["id", "post_id"] },
      ],
      validate: {
        parentCannotReferenceSelf() {
          if (this.parent_comment_id && this.parent_comment_id === this.id) {
            throw new Error("parent_comment_id cannot reference the same comment");
          }
        },
      },
    },
  );
}

export default ClassStreamComment;