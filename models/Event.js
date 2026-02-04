const mongoose = require("mongoose");

// Event participant: joinedAt set on join; depositedAmount updated on each deposit (audit).
const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["creator", "member"], default: "member" },
    joinedAt: { type: Date, default: Date.now },
    depositedAmount: { type: Number, default: 0, min: 0 }, // Sum of deposits by this participant
  },
  { _id: false }
);

// Category participation with timestamps for audit and fair-share settlement.
const categoryParticipantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    participantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Current members (no leftAt)
    categoryParticipants: [categoryParticipantSchema], // Full audit: joinedAt, leftAt
    spendLimit: { type: Number, default: null, min: 0 }, // Category budget limit (alias: budgetLimit)
    budgetLimit: { type: Number, default: null, min: 0 }, // Explicit; kept in sync with spendLimit
    authorizedPayers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Empty = all participants
    approvalRules: {
      requireApprovalAbove: { type: Number, default: null },
      approverIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    },
    status: { type: String, enum: ["active", "closed"], default: "active" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const EventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // eventName
    type: { type: String, enum: ["trip", "dinner", "movie", "other"], default: "other" },
    description: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    participants: [participantSchema],
    categories: [categorySchema],
    startDate: { type: Date }, // startTime
    endDate: { type: Date },   // endTime
    startTime: { type: Date }, // Alias for API; set same as startDate
    endTime: { type: Date },   // Alias for API; set same as endDate
    status: {
      type: String,
      enum: ["active", "ended", "settling", "settled", "closed"],
      default: "active",
    },
    currency: { type: String, default: "USD" },
    defaultSpendingRules: {
      requireCategoryParticipation: { type: Boolean, default: true },
      allowedPayerRoles: { type: [String], default: ["creator", "member"] },
      maxExpensePerCategory: { type: Number, default: null, min: 0 },
    },
    settlementTrigger: { type: String, enum: ["manual", "auto"], default: "manual" },
    // Legacy: same as defaultSpendingRules; kept for backward compatibility.
    paymentRules: {
      allowedPayerRoles: {
        type: [String],
        default: ["creator", "member"], // who may create expenses
      },
      requireCategoryParticipation: {
        type: Boolean,
        default: true, // must have joined category to spend from it
      },
      maxExpensePerCategory: {
        type: Number,
        default: null, // optional hard limit per category
        min: 0,
      },
    },
    // Cached settlement summary once event is settled.
    settlementSummary: {
      status: {
        type: String,
        enum: ["pending", "calculated", "refunded"],
        default: "pending",
      },
      calculatedAt: { type: Date },
      perParticipant: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          totalDeposits: { type: Number, default: 0 },
          totalExpenses: { type: Number, default: 0 },
          net: { type: Number, default: 0 }, // positive => should receive refund, negative => should pay
        },
      ],
    },
  },
  { timestamps: true }
);

// Index for listing events by user
EventSchema.index({ createdBy: 1 });
EventSchema.index({ "participants.userId": 1 });

module.exports = mongoose.model("Event", EventSchema);
