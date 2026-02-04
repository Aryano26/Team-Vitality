const mongoose = require("mongoose");

/**
 * Expense model: represents a bill/receipt within an event.
 * Supports bill upload (image URL), amount, category, and participating members.
 * Links to Transaction records when payment is made from the shared wallet.
 */
const ExpenseSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null, // Can be null if assigned to general/uncategorized
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    description: {
      type: String,
      trim: true,
      required: false,
      default: "",
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, // User who made the payment
    },
    participants: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        share: { type: Number, min: 0 }, // Amount this person owes (calculated or custom)
        paid: { type: Boolean, default: false },
      },
    ],
    billImage: {
      url: { type: String, default: null },
      uploadedAt: { type: Date, default: null },
    },
    splitType: {
      type: String,
      enum: ["equal", "custom", "percentage"],
      default: "equal",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "paid", "disputed"],
      default: "pending",
    },
    approvalRequired: {
      type: Boolean,
      default: false, // If true, expense needs approval before payment
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    relatedTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null, // Links to payment transaction from basket
    },
    // Snapshot of category participants at expense execution time (for fair-share settlement).
    lockedParticipantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

ExpenseSchema.index({ eventId: 1, categoryId: 1 });
ExpenseSchema.index({ paidBy: 1 });
ExpenseSchema.index({ status: 1 });

module.exports = mongoose.model("Expense", ExpenseSchema);
