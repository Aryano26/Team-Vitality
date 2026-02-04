const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["creator", "member"], default: "member" },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    participantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    spendLimit: { type: Number, default: null, min: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const EventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["trip", "dinner", "movie", "other"], default: "other" },
    description: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    participants: [participantSchema],
    categories: [categorySchema],
    startDate: { type: Date },
    endDate: { type: Date },
    status: {
      type: String,
      enum: ["active", "ended", "settling", "settled"],
      default: "active",
    },
    currency: { type: String, default: "USD" },
  },
  { timestamps: true }
);

// Index for listing events by user
EventSchema.index({ createdBy: 1 });
EventSchema.index({ "participants.userId": 1 });

module.exports = mongoose.model("Event", EventSchema);
