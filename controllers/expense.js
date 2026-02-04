const { Event, Wallet, Transaction, Receipt } = require("../models");
const finternet = require("../services/finternet");

async function getEventForUser(eventId, userId) {
  return Event.findOne({
    _id: eventId,
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  });
}

/**
 * Create an expense paid from the shared wallet.
 * Applies simple rule-based authorization:
 * - user must be event participant
 * - if requireCategoryParticipation: must have joined the category
 * - user role must be allowedPayerRoles
 * - category / event spend limits enforced
 */
const createExpense = async (req, res) => {
  const { id: eventId } = req.params;
  const { amount, categoryId, description, receiptImageUrl } = req.body || {};
  const userId = req.user.id;

  const numericAmount = parseFloat(amount);
  if (!numericAmount || isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ msg: "Valid amount is required" });
  }

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }
  if (event.status !== "active") {
    return res.status(400).json({ msg: "Cannot add expenses to a non-active event" });
  }

  const participant = event.participants.find(
    (p) => p.userId.toString() === userId.toString()
  );
  const userRole = participant?.role || "member";
  const allowedRoles = event.paymentRules?.allowedPayerRoles || ["creator", "member"];
  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({ msg: "You are not allowed to pay from this basket" });
  }

  let category = null;
  if (categoryId) {
    category = event.categories.id(categoryId);
    if (!category) {
      return res.status(404).json({ msg: "Category not found" });
    }
    if (event.paymentRules?.requireCategoryParticipation) {
      const isParticipantOfCategory = category.participantIds.some(
        (uid) => uid.toString() === userId.toString()
      );
      if (!isParticipantOfCategory) {
        return res.status(403).json({
          msg: "You must join this category before spending from it",
        });
      }
    }
  }

  // Enforce simple per-category / per-event limits from rules
  const maxPerCategory = event.paymentRules?.maxExpensePerCategory;
  if (maxPerCategory != null && numericAmount > maxPerCategory) {
    return res.status(400).json({
      msg: `Expense exceeds per-category limit of ${maxPerCategory}`,
    });
  }

  let wallet = await Wallet.findOne({ eventId });
  if (!wallet) {
    return res.status(404).json({ msg: "Wallet not found" });
  }
  if (wallet.balance < numericAmount) {
    return res.status(400).json({ msg: "Insufficient balance in shared wallet" });
  }

  // Optionally call external Finternet adapter (currently mocked for expenses)
  const finternetResult = await finternet.processExpense({
    amount: numericAmount,
    currency: wallet.currency,
    walletId: wallet.finternetWalletId,
    eventId,
    categoryId,
    description,
  });
  if (!finternetResult.success) {
    return res.status(502).json({
      msg: "Payment from shared wallet failed",
      error: finternetResult.error,
    });
  }

  const tx = await Transaction.create({
    eventId,
    type: "expense",
    amount: numericAmount,
    currency: wallet.currency,
    userId,
    categoryId: categoryId || null,
    description: description || "",
    status: "completed",
    finternetTxId: finternetResult.finternetTxId,
  });

  wallet.balance -= numericAmount;
  await wallet.save();

  let receipt = null;
  if (receiptImageUrl) {
    receipt = await Receipt.create({
      eventId,
      categoryId: categoryId || null,
      uploadedBy: userId,
      imageUrl: receiptImageUrl,
      totalAmount: numericAmount,
      currency: wallet.currency,
      description: description || "",
      transactionId: tx._id,
    });
  }

  return res.status(201).json({
    transaction: tx,
    wallet: {
      eventId: wallet.eventId,
      balance: wallet.balance,
      currency: wallet.currency,
    },
    receipt,
  });
};

/**
 * Simple event settlement:
 * - sums deposits and expenses per participant
 * - computes net = deposits - expenses
 * - saves summary on Event and marks status as "settled"
 * (no real money movement, but gives clear picture & refunds can be simulated)
 */
const settleEvent = async (req, res) => {
  const { id: eventId } = req.params;
  const userId = req.user.id;

  const event = await Event.findById(eventId).populate("participants.userId", "name email");
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }
  if (event.createdBy.toString() !== userId.toString()) {
    return res.status(403).json({ msg: "Only the event creator can settle the event" });
  }

  const txs = await Transaction.find({ eventId, status: "completed" }).lean();

  const perUser = new Map();
  const ensure = (uid) => {
    if (!perUser.has(uid)) {
      perUser.set(uid, { totalDeposits: 0, totalExpenses: 0 });
    }
    return perUser.get(uid);
  };

  for (const tx of txs) {
    const uid = tx.userId.toString();
    const agg = ensure(uid);
    if (tx.type === "deposit") {
      agg.totalDeposits += tx.amount;
    } else if (tx.type === "expense") {
      agg.totalExpenses += tx.amount;
    }
  }

  const perParticipant = event.participants.map((p) => {
    const uid = p.userId._id.toString();
    const agg = perUser.get(uid) || { totalDeposits: 0, totalExpenses: 0 };
    const net = agg.totalDeposits - agg.totalExpenses;
    return {
      userId: p.userId._id,
      name: p.userId.name,
      email: p.userId.email,
      totalDeposits: agg.totalDeposits,
      totalExpenses: agg.totalExpenses,
      net,
    };
  });

  event.status = "settled";
  event.set("settlementSummary", {
    status: "calculated",
    calculatedAt: new Date(),
    perParticipant,
  });
  await event.save();

  return res.status(200).json({
    status: event.status,
    settlementSummary: event.settlementSummary,
  });
};

/**
 * Real-time visibility: return balances, per-participant totals and recent transactions.
 */
const getEventSummary = async (req, res) => {
  const { id: eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId).populate(
    "participants.userId",
    "name email"
  );
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const wallet = await Wallet.findOne({ eventId });
  const txs = await Transaction.find({ eventId })
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const perUser = new Map();
  const ensure = (uid) => {
    if (!perUser.has(uid)) {
      perUser.set(uid, { totalDeposits: 0, totalExpenses: 0 });
    }
    return perUser.get(uid);
  };

  for (const tx of txs) {
    const uid = tx.userId?._id?.toString();
    if (!uid) continue;
    const agg = ensure(uid);
    if (tx.type === "deposit") {
      agg.totalDeposits += tx.amount;
    } else if (tx.type === "expense") {
      agg.totalExpenses += tx.amount;
    }
  }

  const participants = event.participants.map((p) => {
    const uid = p.userId._id.toString();
    const agg = perUser.get(uid) || { totalDeposits: 0, totalExpenses: 0 };
    const net = agg.totalDeposits - agg.totalExpenses;
    return {
      userId: p.userId._id,
      name: p.userId.name,
      email: p.userId.email,
      role: p.role,
      totalDeposits: agg.totalDeposits,
      totalExpenses: agg.totalExpenses,
      net,
    };
  });

  return res.status(200).json({
    event: {
      id: event._id,
      name: event.name,
      status: event.status,
      currency: event.currency,
    },
    wallet: wallet
      ? {
          balance: wallet.balance,
          currency: wallet.currency,
          status: wallet.status,
        }
      : null,
    participants,
    transactions: txs,
    settlementSummary: event.settlementSummary || null,
  });
};

module.exports = {
  createExpense,
  settleEvent,
  getEventSummary,
};
