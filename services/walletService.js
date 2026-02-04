/**
 * Wallet service: credit (deposit) and debit (expense) with audit and rollback on failure.
 * Ensures wallet balance NEVER goes negative.
 */

const { Event, Wallet, Transaction } = require("../models");

/**
 * Credit the shared wallet and optionally update participant's depositedAmount.
 * Used for deposits only (not expenses).
 * @param {Object} params
 * @param {string} eventId - Event _id
 * @param {string} userId - User making the deposit
 * @param {number} amount - Amount to add (must be > 0)
 * @param {Object} [options] - { currency, finternetTxId, description }
 * @returns {{ success: boolean, transaction?: Object, wallet?: Object, error?: string }}
 */
async function credit({ eventId, userId, amount, currency = "USD", finternetTxId = null, description = "" }) {
  if (!amount || amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const wallet = await Wallet.findOne({ eventId });
  if (!wallet) return { success: false, error: "Wallet not found" };
  if (wallet.status !== "active") return { success: false, error: "Wallet is closed" };

  const event = await Event.findById(eventId);
  if (!event) return { success: false, error: "Event not found" };
  if (event.status !== "active") return { success: false, error: "Event is not active" };

  const tx = await Transaction.create({
    eventId,
    type: "deposit",
    amount,
    currency: currency || wallet.currency,
    userId,
    status: "completed",
    finternetTxId,
    description: description || "Deposit",
  });

  wallet.balance += amount;
  await wallet.save();

  // Update participant's depositedAmount for settlement
  const participant = event.participants.find((p) => p.userId.toString() === userId.toString());
  if (participant) {
    participant.depositedAmount = (participant.depositedAmount || 0) + amount;
    await event.save();
  }

  return { success: true, transaction: tx, wallet };
}

/**
 * Debit the shared wallet. Fails if balance would go negative.
 * Used when an expense is executed (approved and paid).
 * @param {Object} params
 * @param {string} eventId
 * @param {number} amount
 * @param {string} userId - Payer (for transaction record)
 * @param {string} [categoryId]
 * @param {string} [description]
 * @param {string} [currency]
 * @returns {{ success: boolean, transaction?: Object, wallet?: Object, error?: string }}
 */
async function debit({ eventId, amount, userId, categoryId = null, description = "", currency = "USD" }) {
  if (!amount || amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const wallet = await Wallet.findOne({ eventId });
  if (!wallet) return { success: false, error: "Wallet not found" };
  if (wallet.status !== "active") return { success: false, error: "Wallet is closed" };

  if (wallet.balance < amount) {
    return { success: false, error: "Insufficient balance in shared wallet" };
  }

  const tx = await Transaction.create({
    eventId,
    type: "expense",
    amount,
    currency: currency || wallet.currency,
    userId,
    categoryId,
    description,
    status: "completed",
  });

  wallet.balance -= amount;
  await wallet.save();

  return { success: true, transaction: tx, wallet };
}

module.exports = { credit, debit };
