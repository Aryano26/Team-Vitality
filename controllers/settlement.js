const { Event, Expense, Wallet, Transaction, Settlement } = require("../models");
const finternet = require("../services/finternet");

async function getEventForUser(eventId, userId) {
  return Event.findOne({
    _id: eventId,
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  });
}

/**
 * Calculate settlement for all participants in an event.
 * DUMMY API ENDPOINT: GET /api/v1/events/:eventId/settlement/calculate
 */
const calculateSettlement = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  // Get all deposits and expenses
  const transactions = await Transaction.find({ eventId, type: "deposit", status: "completed" });
  const expenses = await Expense.find({ eventId, status: "approved" });

  // Build deposits map
  const deposits = {};
  transactions.forEach((tx) => {
    const userId = tx.userId.toString();
    deposits[userId] = (deposits[userId] || 0) + tx.amount;
  });

  // Calculate per-participant spending
  const participantSpending = {};
  expenses.forEach((expense) => {
    expense.participants.forEach((participant) => {
      const userId = participant.userId.toString();
      participantSpending[userId] = (participantSpending[userId] || 0) + participant.share;
    });
  });

  const allParticipantIds = event.participants.map((p) => p.userId.toString());
  const settlements = {};

  allParticipantIds.forEach((participantId) => {
    const deposited = deposits[participantId] || 0;
    const spent = participantSpending[participantId] || 0;
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalDeposited = Object.values(deposits).reduce((sum, d) => sum + d, 0);

    settlements[participantId] = {
      participantId,
      totalDeposited: deposited,
      totalSpent: spent,
      shareAmount: (spent / (totalExpenses || 1)) * totalDeposited,
      amountOwed: deposited - spent,
      refundAmount: Math.max(0, deposited - spent),
    };
  });

  return res.status(200).json({
    settlement: settlements,
    totalDeposited: Object.values(deposits).reduce((sum, d) => sum + d, 0),
    totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
  });
};

/**
 * Execute settlement: create refund transactions from basket for overpaid participants.
 * DUMMY API ENDPOINT: POST /api/v1/events/:eventId/settlement/execute
 */
const executeSettlement = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const isCreator = event.createdBy.toString() === userId.toString();
  if (!isCreator) {
    return res.status(403).json({
      msg: "Only event creator can execute settlement",
    });
  }

  if (event.status !== "active") {
    return res.status(400).json({ msg: "Event is not active" });
  }

  // Get wallet
  const wallet = await Wallet.findOne({ eventId });
  if (!wallet) {
    return res.status(404).json({ msg: "Wallet not found" });
  }

  // Calculate settlements
  const transactions = await Transaction.find({ eventId, type: "deposit", status: "completed" });
  const expenses = await Expense.find({ eventId, status: "approved" });

  const deposits = {};
  transactions.forEach((tx) => {
    const userId = tx.userId.toString();
    deposits[userId] = (deposits[userId] || 0) + tx.amount;
  });

  const participantSpending = {};
  expenses.forEach((expense) => {
    expense.participants.forEach((participant) => {
      const userId = participant.userId.toString();
      participantSpending[userId] = (participantSpending[userId] || 0) + participant.share;
    });
  });

  const totalDeposited = Object.values(deposits).reduce((sum, d) => sum + d, 0);
  const totalSpent = Object.values(participantSpending).reduce((sum, s) => sum + s, 0);

  // Check wallet has enough balance
  if (wallet.balance < totalSpent) {
    return res.status(400).json({
      msg: "Wallet balance insufficient for settlement",
      required: totalSpent,
      available: wallet.balance,
    });
  }

  const refunds = [];
  const allParticipantIds = event.participants.map((p) => p.userId.toString());

  for (const participantId of allParticipantIds) {
    const deposited = deposits[participantId] || 0;
    const spent = participantSpending[participantId] || 0;
    const refundAmount = deposited - spent;

    if (refundAmount > 0) {
      // Create refund transaction
      const refundTx = await Transaction.create({
        eventId,
        type: "refund",
        amount: refundAmount,
        currency: event.currency,
        userId: participantId,
        status: "pending",
        description: "Settlement refund",
      });

      // Create or update settlement record
      let settlement = await Settlement.findOne({ eventId, participantId });
      if (!settlement) {
        settlement = await Settlement.create({
          eventId,
          participantId,
          totalDeposited: deposited,
          totalSpent: spent,
          shareAmount: spent,
          amountOwed: refundAmount,
          refundAmount,
          refundTransactionId: refundTx._id,
          refundStatus: "pending",
          status: "pending",
        });
      } else {
        settlement.refundAmount = refundAmount;
        settlement.refundStatus = "pending";
        settlement.refundTransactionId = refundTx._id;
        settlement.status = "pending";
        await settlement.save();
      }

      refunds.push({
        participantId,
        refundAmount,
        transactionId: refundTx._id,
      });

      // Deduct from wallet
      wallet.balance -= refundAmount;
    }
  }

  // Update event status
  event.status = "settling";
  await event.save();
  await wallet.save();

  return res.status(200).json({
    message: "Settlement executed",
    refunds,
    remainingBalance: wallet.balance,
  });
};

/**
 * Process refund for a single participant via Finternet.
 * DUMMY API ENDPOINT: POST /api/v1/events/:eventId/settlement/refund/:participantId
 */
const processRefund = async (req, res) => {
  const { eventId, participantId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const isCreator = event.createdBy.toString() === userId.toString();
  if (!isCreator) {
    return res.status(403).json({
      msg: "Only event creator can process refunds",
    });
  }

  let settlement = await Settlement.findOne({ eventId, participantId });
  if (!settlement) {
    return res.status(404).json({ msg: "Settlement not found" });
  }

  if (settlement.refundStatus === "completed") {
    return res.status(400).json({ msg: "Refund already completed" });
  }

  const wallet = await Wallet.findOne({ eventId });
  if (!wallet) {
    return res.status(404).json({ msg: "Wallet not found" });
  }

  // Call Finternet to process refund
  const finternetResult = await finternet.processRefund({
    amount: settlement.refundAmount,
    currency: event.currency,
    userId: participantId,
    walletId: wallet.finternetWalletId,
    eventId: eventId.toString(),
  });

  if (!finternetResult.success) {
    settlement.refundStatus = "failed";
    await settlement.save();

    return res.status(502).json({
      msg: "Refund processing failed",
      error: finternetResult.error,
    });
  }

  // Update settlement and transaction
  settlement.refundStatus = "completed";
  settlement.status = "refunded";
  await settlement.save();

  const refundTx = await Transaction.findById(settlement.refundTransactionId);
  if (refundTx) {
    refundTx.status = "completed";
    refundTx.finternetTxId = finternetResult.finternetTxId;
    await refundTx.save();
  }

  return res.status(200).json({
    settlement,
    message: "Refund processed successfully",
    finternetTxId: finternetResult.finternetTxId,
  });
};

/**
 * Get settlement status for event.
 * DUMMY API ENDPOINT: GET /api/v1/events/:eventId/settlement
 */
const getSettlementStatus = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const settlements = await Settlement.find({ eventId })
    .populate("participantId", "name email")
    .lean();

  const wallet = await Wallet.findOne({ eventId });

  return res.status(200).json({
    settlements,
    walletBalance: wallet?.balance || 0,
    eventStatus: event.status,
  });
};

/**
 * Complete settlement (mark event as settled, close wallet).
 * DUMMY API ENDPOINT: PATCH /api/v1/events/:eventId/settlement/complete
 */
const completeSettlement = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const isCreator = event.createdBy.toString() === userId.toString();
  if (!isCreator) {
    return res.status(403).json({
      msg: "Only event creator can complete settlement",
    });
  }

  // Check all refunds are processed
  const pendingSettlements = await Settlement.find({ eventId, refundStatus: "pending" });
  if (pendingSettlements.length > 0) {
    return res.status(400).json({
      msg: "Cannot complete settlement with pending refunds",
      pendingCount: pendingSettlements.length,
    });
  }

  // Update event and wallet
  event.status = "settled";
  await event.save();

  const wallet = await Wallet.findOne({ eventId });
  if (wallet) {
    wallet.status = "closed";
    await wallet.save();
  }

  return res.status(200).json({
    event,
    message: "Settlement completed and event closed",
  });
};

module.exports = {
  calculateSettlement,
  executeSettlement,
  processRefund,
  getSettlementStatus,
  completeSettlement,
};
