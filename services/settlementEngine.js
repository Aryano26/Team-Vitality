/**
 * Settlement engine: fair-share calculation using locked expense participants.
 * fairShare = totalSpent / participantCount (per expense); net = depositedAmount - sum(fairShares).
 */

const { Event, Transaction, Expense } = require("../models");

/** Smallest currency unit for rounding (e.g. cents). Use 100 for USD. */
const CENTS = 100;

function roundMoney(value) {
  return Math.round(value * CENTS) / CENTS;
}

/**
 * Calculate fair-share settlement for an event.
 * Uses: (1) participant.depositedAmount from Event, (2) completed expenses with lockedParticipantIds.
 * For each expense: fairSharePerPerson = amount / lockedParticipantIds.length; each locked participant owes that share.
 *
 * @param {string} eventId - Event _id
 * @returns {Promise<{ perParticipant: Array<{ userId, depositedAmount, totalExpenseShare, net, refundAmount }>, totalDeposited, totalSpent }>}
 */
async function calculateSettlement(eventId) {
  const event = await Event.findById(eventId).populate("participants.userId", "name email");
  if (!event) return null;

  const totalDeposited = event.participants.reduce((sum, p) => sum + (p.depositedAmount || 0), 0);

  // Get all completed expenses (paid from wallet) with locked participants
  const expenses = await Expense.find({
    eventId,
    status: "paid",
    relatedTransactionId: { $ne: null },
  }).lean();

  const expenseTxIds = new Set(
    expenses.map((e) => e.relatedTransactionId?.toString()).filter(Boolean)
  );

  // Per-user expense share: sum of (expense.amount / lockedCount) for each expense they're in
  const userExpenseShare = new Map();

  for (const exp of expenses) {
    const amount = exp.amount;
    let participantIds = exp.lockedParticipantIds && exp.lockedParticipantIds.length > 0
      ? exp.lockedParticipantIds.map((id) => id.toString())
      : null;

    if (!participantIds && exp.participants && exp.participants.length > 0) {
      participantIds = exp.participants.map((p) => p.userId.toString());
    }
    if (!participantIds || participantIds.length === 0) {
      // Fallback: all event participants (legacy)
      participantIds = event.participants.map((p) => p.userId.toString());
    }

    const count = participantIds.length;
    const fairShare = count > 0 ? roundMoney(amount / count) : 0;

    for (const uid of participantIds) {
      const current = userExpenseShare.get(uid) || 0;
      userExpenseShare.set(uid, roundMoney(current + fairShare));
    }
  }

  // Legacy: expenses recorded only as Transaction (no Expense doc) - attribute to all participants
  const expenseTxs = await Transaction.find({ eventId, type: "expense", status: "completed" }).lean();
  for (const tx of expenseTxs) {
    if (expenseTxIds.has(tx._id.toString())) continue;
    const amount = tx.amount;
    const participantIds = event.participants.map((p) => p.userId.toString());
    const count = participantIds.length || 1;
    const fairShare = roundMoney(amount / count);
    for (const uid of participantIds) {
      const current = userExpenseShare.get(uid) || 0;
      userExpenseShare.set(uid, roundMoney(current + fairShare));
    }
  }

  const totalSpent = Array.from(userExpenseShare.values()).reduce((s, v) => s + v, 0);

  const perParticipant = event.participants.map((p) => {
    const uid = p.userId._id.toString();
    const depositedAmount = p.depositedAmount ?? 0;
    const totalExpenseShare = userExpenseShare.get(uid) || 0;
    const net = roundMoney(depositedAmount - totalExpenseShare);
    const refundAmount = net > 0 ? net : 0;
    return {
      userId: p.userId._id,
      name: p.userId.name,
      email: p.userId.email,
      depositedAmount,
      totalExpenseShare,
      net,
      refundAmount,
    };
  });

  return {
    perParticipant,
    totalDeposited,
    totalSpent,
  };
}

/**
 * Settle a single category: compute fair share for that category's expenses only.
 * Used when closing a category. Uses locked participants on expenses in that category.
 */
async function settleCategory(categoryId, eventId) {
  const event = await Event.findById(eventId);
  if (!event) return null;
  const category = event.categories.id(categoryId);
  if (!category) return null;

  const expenses = await Expense.find({
    eventId,
    categoryId,
    status: "paid",
  }).lean();

  const userShare = new Map();
  for (const exp of expenses) {
    const ids = exp.lockedParticipantIds?.length
      ? exp.lockedParticipantIds.map((id) => id.toString())
      : (exp.participants || []).map((p) => p.userId.toString());
    if (ids.length === 0) continue;
    const fairShare = roundMoney(exp.amount / ids.length);
    for (const uid of ids) {
      userShare.set(uid, (userShare.get(uid) || 0) + fairShare);
    }
  }

  return { perUserShare: Object.fromEntries(userShare) };
}

module.exports = { calculateSettlement, settleCategory, roundMoney, CENTS };
