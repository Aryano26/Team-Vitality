const mongoose = require("mongoose");

/**
 * Shared wallet (basket) for an event.
 * Participants deposit money here; expenses are paid from this balance.
 * Finternet integration: finternetWalletId links to external wallet/vault.
 */
const WalletSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      unique: true,
    },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "USD" },
    finternetWalletId: { type: String, default: null },
    status: { type: String, enum: ["active", "closed"], default: "active" },
  },
  { timestamps: true }
);

WalletSchema.index({ eventId: 1 });

module.exports = mongoose.model("Wallet", WalletSchema);
