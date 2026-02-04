const { Event, Expense, Wallet, Transaction, Settlement } = require("../models");
const finternet = require("../services/finternet");
const settlementEngine = require("../services/settlementEngine");

async function getEventForUser(eventId, userId) {
  return Event.findOne({
    _id: eventId,
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  });
}

/**
 * STEP 10: Calculate settlement using fair-share engine (locked participants, depositedAmount).
 * GET /api/v1/events/:eventId/settlement/calculate
 */
const calculateSettlement = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) return res.status(404).json({ msg: "Event not found" });

  const result = await settlementEngine.calculateSettlement(eventId);
  if (!result) return res.status(404).json({ msg: "Event not found" });

  const settlement = {};
  result.perParticipant.forEach((p) => {
    const id = p.userId.toString();
    settlement[id] = {
      participantId: id,
      totalDeposited: p.depositedAmount,
      totalSpent: p.totalExpenseShare,
      shareAmount: p.totalExpenseShare,
      amountOwed: p.net,
      refundAmount: p.refundAmount,
    };
  });

  return res.status(200).json({
    settlement,
    totalDeposited: result.totalDeposited,
    totalExpenses: result.totalSpent,
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

  const wallet = await Wallet.findOne({ eventId });
  if (!wallet) return res.status(404).json({ msg: "Wallet not found" });

  // STEP 10/11: Use settlement engine (fair-share from locked participants, depositedAmount)
  const result = await settlementEngine.calculateSettlement(eventId);
  if (!result) return res.status(404).json({ msg: "Event not found" });

  const totalRefunds = result.perParticipant.reduce((s, p) => s + p.refundAmount, 0);
  if (wallet.balance < totalRefunds) {
    return res.status(400).json({
      msg: "Wallet balance insufficient for settlement",
      required: totalRefunds,
      available: wallet.balance,
    });
  }

  const refunds = [];
  for (const p of result.perParticipant) {
    const participantId = p.userId.toString();
    const refundAmount = p.refundAmount;

    if (refundAmount > 0) {
      const refundTx = await Transaction.create({
        eventId,
        type: "refund",
        amount: refundAmount,
        currency: event.currency || "USD",
        userId: participantId,
        status: "pending",
        description: "Settlement refund",
      });

      let settlementRecord = await Settlement.findOne({ eventId, participantId });
      if (!settlementRecord) {
        settlementRecord = await Settlement.create({
          eventId,
          participantId,
          totalDeposited: p.depositedAmount,
          totalSpent: p.totalExpenseShare,
          shareAmount: p.totalExpenseShare,
          amountOwed: p.net,
          refundAmount,
          refundTransactionId: refundTx._id,
          refundStatus: "pending",
          status: "pending",
        });
      } else {
        settlementRecord.refundAmount = refundAmount;
        settlementRecord.refundStatus = "pending";
        settlementRecord.refundTransactionId = refundTx._id;
        settlementRecord.status = "pending";
        await settlementRecord.save();
      }

      refunds.push({
        participantId,
        refundAmount,
        transactionId: refundTx._id,
      });

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
