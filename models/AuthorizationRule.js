const mongoose = require("mongoose");

/**
 * Authorization Rules: define who can pay from the basket and under what conditions.
 * Supports spending limits, approval thresholds, and authorized users.
 */
const AuthorizationRuleSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      unique: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, // Event creator
    },
    authorizedUsers: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        spendingLimit: { type: Number, default: null }, // Max per transaction or null for unlimited
        requiresApproval: { type: Boolean, default: false },
      },
    ],
    approvalThreshold: {
      type: Number,
      default: 500, // Amounts above this require approval
    },
    approvers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // Users who can approve payments
      },
    ],
    maxParticipantShare: {
      type: Number,
      default: null, // Max amount any single participant should pay
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

AuthorizationRuleSchema.index({ eventId: 1 });

module.exports = mongoose.model("AuthorizationRule", AuthorizationRuleSchema);
