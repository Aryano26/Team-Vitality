const mongoose = require("mongoose");

/**
 * Settlement model: tracks final settlement after all expenses.
 * Records who owes whom and refund details.
 */
const SettlementSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    participantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    totalDeposited: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
      min: 0,
    },
    shareAmount: {
      type: Number,
      default: 0,
    },
    amountOwed: {
      type: Number,
      default: 0, // Negative if they paid too much (eligible for refund)
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    refundTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "settled", "refunded"],
      default: "pending",
    },
  },
  { timestamps: true }
);

SettlementSchema.index({ eventId: 1 });
SettlementSchema.index({ participantId: 1 });

module.exports = mongoose.model("Settlement", SettlementSchema);
