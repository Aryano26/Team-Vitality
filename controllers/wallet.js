const { Event, Wallet, Transaction } = require("../models");
const finternet = require("../services/finternet");
const walletService = require("../services/walletService");

/**
 * Ensure wallet has finternetWalletId (create via Finternet if needed).
 */
async function ensureFinternetWallet(wallet) {
  if (!wallet.finternetWalletId) {
    const result = await finternet.createWallet(wallet.eventId.toString());
    if (result.success && result.walletId) {
      wallet.finternetWalletId = result.walletId;
      await wallet.save();
    }
  }
  return wallet;
}

/**
 * Get wallet for an event. User must be a participant.
 */
const getWallet = async (req, res) => {
  const { id: eventId } = req.params;
  const userId = req.user.id;

  const event = await Event.findOne({
    _id: eventId,
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  });

  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  let wallet = await Wallet.findOne({ eventId });
  if (!wallet) {
    return res.status(404).json({ msg: "Wallet not found" });
  }

  wallet = await ensureFinternetWallet(wallet);

  return res.status(200).json({
    wallet: {
      eventId: wallet.eventId,
      balance: wallet.balance,
      currency: wallet.currency,
      status: wallet.status,
      finternetWalletId: wallet.finternetWalletId,
    },
  });
};

/**
 * Deposit money into the event's shared wallet.
 * Uses Finternet payment intents when configured: creates intent, returns paymentUrl for redirect.
 * Webhook credits wallet on payment success.
 * Fallback: synchronous processDeposit (mock/dev).
 */
const deposit = async (req, res) => {
  const { id: eventId } = req.params;
  const amount = parseFloat(req.body?.amount);
  const userId = req.user.id;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ msg: "Valid amount is required" });
  }

  const event = await Event.findOne({
    _id: eventId,
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  });

  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  if (event.status !== "active") {
    return res.status(400).json({ msg: "Cannot deposit into a closed event" });
  }

  let wallet = await Wallet.findOne({ eventId });
  if (!wallet) {
    return res.status(404).json({ msg: "Wallet not found" });
  }

  wallet = await ensureFinternetWallet(wallet);

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const successUrl = `${frontendUrl}/events/${eventId}?deposit=success`;
  const cancelUrl = `${frontendUrl}/events/${eventId}?deposit=cancelled`;

  const intentResult = await finternet.createPaymentIntent({
    amount,
    currency: wallet.currency,
    userId,
    walletId: wallet.finternetWalletId,
    eventId: eventId.toString(),
    successUrl,
    cancelUrl,
  });

  if (intentResult.success && intentResult.paymentUrl) {
    const tx = await Transaction.create({
      eventId,
      type: "deposit",
      amount,
      currency: wallet.currency,
      userId,
      status: "pending",
      finternetIntentId: intentResult.intentId,
    });

    return res.status(201).json({
      paymentUrl: intentResult.paymentUrl,
      intentId: intentResult.intentId,
      transactionId: tx._id,
      message: "Redirect user to payment URL",
    });
  }

  const finternetResult = await finternet.processDeposit({
    amount,
    currency: wallet.currency,
    userId,
    walletId: wallet.finternetWalletId,
    eventId,
  });

  if (!finternetResult.success) {
    return res.status(502).json({
      msg: "Payment processing failed",
      error: finternetResult.error,
    });
  }

  // STEP 5: Credit wallet and update participant depositedAmount (deposits are CREDITS, not expenses)
  const creditResult = await walletService.credit({
    eventId,
    userId,
    amount,
    currency: wallet.currency,
    finternetTxId: finternetResult.finternetTxId,
    description: "Deposit",
  });

  if (!creditResult.success) {
    return res.status(502).json({ msg: creditResult.error || "Failed to credit wallet" });
  }

  return res.status(201).json({
    transaction: creditResult.transaction,
    wallet: {
      eventId: creditResult.wallet.eventId,
      balance: creditResult.wallet.balance,
      currency: creditResult.wallet.currency,
    },
  });
};

/**
 * List transactions for an event (deposits, expenses, refunds).
 */
const listTransactions = async (req, res) => {
  const { id: eventId } = req.params;
  const userId = req.user.id;

  const event = await Event.findOne({
    _id: eventId,
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  });

  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const transactions = await Transaction.find({ eventId })
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return res.status(200).json({ transactions });
};

module.exports = {
  getWallet,
  deposit,
  listTransactions,
};
