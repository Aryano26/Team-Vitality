const mongoose = require("mongoose");

/**
 * Receipt uploaded for an event expense.
 * For now we just store metadata + optional image URL / file reference.
 * OCR / scanning can be plugged in later to auto-populate amount/details.
 */
const ReceiptSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    imageUrl: { type: String }, // URL or path to the uploaded image/PDF
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD" },
    description: { type: String, default: "" },
    // Link to created expense transaction, if any
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

ReceiptSchema.index({ eventId: 1 });

module.exports = mongoose.model("Receipt", ReceiptSchema);

