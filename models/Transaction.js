const mongoose = require("mongoose");

/**
 * Unified transaction model for deposits, expenses, and refunds.
 * Finternet: finternetTxId stores the payment gateway transaction reference.
 */
const TransactionSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    type: { type: String, enum: ["deposit", "expense", "refund"], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
    },
    finternetTxId: { type: String, default: null },
    finternetIntentId: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

TransactionSchema.index({ eventId: 1, type: 1 });
TransactionSchema.index({ userId: 1 });
TransactionSchema.index({ finternetIntentId: 1 });

module.exports = mongoose.model("Transaction", TransactionSchema);
