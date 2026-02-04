const { Event, Wallet, Transaction, Expense, Receipt } = require("../models");
const finternet = require("../services/finternet");
const { validatePayment } = require("../services/ruleEngine");
const walletService = require("../services/walletService");

async function getEventForUser(eventId, userId) {
  return Event.findOne({
    _id: eventId,
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  });
}

/** Get current total spend for a category from completed expense transactions. */
async function getCategoryCurrentSpend(eventId, categoryId) {
  if (!categoryId) return 0;
  const result = await Transaction.aggregate([
    { $match: { eventId, type: "expense", status: "completed", categoryId } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return result[0]?.total ?? 0;
}

/**
 * STEP 6 & 7: Rule-based payment from wallet. Validates via rule engine; if approval required
 * creates expense as PENDING (no deduction). Otherwise executes: debit wallet, snapshot category
 * participants on expense (lockedParticipantIds), link transaction. Wallet balance never goes negative.
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
  if (!event) return res.status(404).json({ msg: "Event not found" });
  if (event.status !== "active") {
    return res.status(400).json({ msg: "Cannot add expenses to a non-active event" });
  }

  let category = null;
  if (categoryId) {
    category = event.categories.id(categoryId);
    if (!category) return res.status(404).json({ msg: "Category not found" });
  }

  const wallet = await Wallet.findOne({ eventId });
  if (!wallet) return res.status(404).json({ msg: "Wallet not found" });

  const categoryCurrentSpend = await getCategoryCurrentSpend(eventId, categoryId || null);
  const validation = validatePayment({
    event,
    category,
    payerUserId: userId,
    amount: numericAmount,
    walletBalance: wallet.balance,
    categoryCurrentSpend,
  });

  if (!validation.valid) {
    return res.status(400).json({ msg: validation.reason });
  }

  // If approval required: create expense as PENDING, do NOT deduct wallet (STEP 6).
  if (validation.requiresApproval) {
    const expense = await Expense.create({
      eventId,
      categoryId: categoryId || null,
      amount: numericAmount,
      currency: wallet.currency,
      description: description || "",
      paidBy: userId,
      participants: [],
      status: "pending",
      approvalRequired: true,
    });
    return res.status(201).json({
      expense,
      message: "Expense created; approval required before payment",
    });
  }

  // Execute payment: snapshot participants, debit wallet, lock expense (STEP 7).
  const snapshot =
    category && category.participantIds && category.participantIds.length > 0
      ? [...category.participantIds]
      : event.participants.map((p) => p.userId);

  const debitResult = await walletService.debit({
    eventId,
    amount: numericAmount,
    userId,
    categoryId: categoryId || null,
    description: description || "",
    currency: wallet.currency,
  });

  if (!debitResult.success) {
    return res.status(400).json({ msg: debitResult.error || "Payment failed" });
  }

  const expense = await Expense.create({
    eventId,
    categoryId: categoryId || null,
    amount: numericAmount,
    currency: wallet.currency,
    description: description || "",
    paidBy: userId,
    participants: snapshot.map((uid) => ({ userId: uid, share: numericAmount / snapshot.length, paid: false })),
    status: "paid",
    approvalRequired: false,
    relatedTransactionId: debitResult.transaction._id,
    lockedParticipantIds: snapshot,
  });

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
      transactionId: debitResult.transaction._id,
    });
  }

  return res.status(201).json({
    transaction: debitResult.transaction,
    wallet: {
      eventId: debitResult.wallet.eventId,
      balance: debitResult.wallet.balance,
      currency: debitResult.wallet.currency,
    },
    receipt,
    expense,
  });
};

/**
 * Approve a pending expense: deduct wallet, snapshot category participants, mark expense paid (STEP 6 approval flow).
 */
const approveExpense = async (req, res) => {
  const { id: eventId, expenseId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) return res.status(404).json({ msg: "Event not found" });
  if (event.status !== "active") return res.status(400).json({ msg: "Event is not active" });

  const expense = await Expense.findOne({ _id: expenseId, eventId });
  if (!expense) return res.status(404).json({ msg: "Expense not found" });
  if (expense.status !== "pending") return res.status(400).json({ msg: "Expense is not pending approval" });

  const category = expense.categoryId
    ? event.categories.id(expense.categoryId)
    : null;
  const wallet = await Wallet.findOne({ eventId });
  if (!wallet) return res.status(404).json({ msg: "Wallet not found" });

  const categoryCurrentSpend = await getCategoryCurrentSpend(eventId, expense.categoryId || null);
  const validation = validatePayment({
    event,
    category,
    payerUserId: expense.paidBy,
    amount: expense.amount,
    walletBalance: wallet.balance,
    categoryCurrentSpend,
  });
  if (!validation.valid) {
    return res.status(400).json({ msg: validation.reason });
  }

  const snapshot =
    category && category.participantIds && category.participantIds.length > 0
      ? [...category.participantIds]
      : event.participants.map((p) => p.userId);

  const debitResult = await walletService.debit({
    eventId,
    amount: expense.amount,
    userId: expense.paidBy,
    categoryId: expense.categoryId || null,
    description: expense.description || "",
    currency: expense.currency || wallet.currency,
  });

  if (!debitResult.success) {
    return res.status(400).json({ msg: debitResult.error || "Payment failed" });
  }

  expense.status = "paid";
  expense.relatedTransactionId = debitResult.transaction._id;
  expense.lockedParticipantIds = snapshot;
  expense.approvedBy = userId;
  expense.participants = snapshot.map((uid) => ({
    userId: uid,
    share: expense.amount / snapshot.length,
    paid: false,
  }));
  await expense.save();

  return res.status(200).json({
    expense,
    transaction: debitResult.transaction,
    wallet: {
      eventId: debitResult.wallet.eventId,
      balance: debitResult.wallet.balance,
      currency: debitResult.wallet.currency,
    },
  });
};

const settlementEngine = require("../services/settlementEngine");

/**
 * STEP 10: Settlement engine. Uses locked participant snapshots on expenses;
 * fairShare = totalSpent / participantCount per expense; net = depositedAmount - fairShare.
 * Saves summary on Event and marks status as "settled". Refunds/debits executed separately (STEP 11).
 */
const settleEvent = async (req, res) => {
  const { id: eventId } = req.params;
  const userId = req.user.id;

  const event = await Event.findById(eventId).populate("participants.userId", "name email");
  if (!event) return res.status(404).json({ msg: "Event not found" });
  if (event.createdBy.toString() !== userId.toString()) {
    return res.status(403).json({ msg: "Only the event creator can settle the event" });
  }

  const result = await settlementEngine.calculateSettlement(eventId);
  if (!result) return res.status(404).json({ msg: "Event not found" });

  const perParticipant = result.perParticipant.map((p) => ({
    userId: p.userId,
    name: p.name,
    email: p.email,
    totalDeposits: p.depositedAmount,
    totalExpenses: p.totalExpenseShare,
    net: p.net,
    refundAmount: p.refundAmount,
  }));

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
    totalDeposited: result.totalDeposited,
    totalSpent: result.totalSpent,
  });
};

/**
 * STEP 8: Real-time visibility. After any state change (deposit, expense, approval):
 * wallet balance, category spend, and per-participant totals (depositedAmount from Event, expense share from settlement logic).
 */
const getEventSummary = async (req, res) => {
  const { id: eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId).populate(
    "participants.userId",
    "name email"
  );
  if (!event) return res.status(404).json({ msg: "Event not found" });
  const wallet = await Wallet.findOne({ eventId });
  const txs = await Transaction.find({ eventId })
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  // Use settlement engine for consistent per-participant view (depositedAmount, fair-share expenses)
  const settlement = await settlementEngine.calculateSettlement(eventId);
  const roleByUserId = new Map(
    event.participants.map((p) => [p.userId._id.toString(), p.role])
  );
  const participants = settlement
    ? settlement.perParticipant.map((p) => ({
        userId: p.userId,
        name: p.name,
        email: p.email,
        role: roleByUserId.get(p.userId.toString()) || "member",
        totalDeposits: p.depositedAmount,
        totalExpenses: p.totalExpenseShare,
        net: p.net,
      }))
    : event.participants.map((p) => ({
        userId: p.userId._id,
        name: p.userId.name,
        email: p.userId.email,
        role: p.role,
        totalDeposits: p.depositedAmount ?? 0,
        totalExpenses: 0,
        net: p.depositedAmount ?? 0,
      }));

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

/**
 * List expenses for an event (pending and paid). Used by frontend for approval UI and activity.
 */
const listExpenses = async (req, res) => {
  const { id: eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) return res.status(404).json({ msg: "Event not found" });

  const expenses = await Expense.find({ eventId })
    .populate("paidBy", "name email")
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({ expenses });
};

module.exports = {
  createExpense,
  approveExpense,
  settleEvent,
  getEventSummary,
  listExpenses,
};
