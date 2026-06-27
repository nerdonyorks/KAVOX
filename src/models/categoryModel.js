const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Enforce unique category name (across all categories, including deleted ones)
categorySchema.index({ name: 1 }, { unique: true });

// Indexing for search performance
categorySchema.index({ name: "text" });

module.exports = mongoose.model("Category", categorySchema);
