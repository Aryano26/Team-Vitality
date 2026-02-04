const { Transaction, Wallet, Event } = require("../models");

/**
 * Finternet webhook: payment intent succeeded.
 * Called by Finternet when user completes payment. We credit the wallet.
 * Verify webhook signature if FINTERNET_WEBHOOK_SECRET is set.
 */
const finternetWebhook = async (req, res) => {
  const payload = req.body || {};

  // Optional: verify Finternet webhook signature
  const secret = process.env.FINTERNET_WEBHOOK_SECRET;
  if (secret && req.headers["x-finternet-signature"] && req.rawBody) {
    // TODO: Implement HMAC verification when Finternet provides spec
    // const crypto = require("crypto");
    // const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
    // if (req.headers["x-finternet-signature"] !== expected) return res.status(401).send();
  }

  const eventType = payload.type || payload.event || payload.eventType;
  const data = payload.data || payload;

  if (eventType === "payment_intent.succeeded" || eventType === "payment.succeeded" || eventType === "deposit.completed") {
    const intentId = data.id || data.intentId || data.paymentIntentId;
    const txId = data.transactionId || data.id;
    const amount = parseFloat(data.amount);
    const eventId = data.metadata?.eventId;

    if (!amount || amount <= 0) {
      return res.status(400).json({ msg: "Invalid amount" });
    }

    let tx = null;
    if (intentId) {
      tx = await Transaction.findOne({ finternetIntentId: intentId, type: "deposit", status: "pending" });
    }
    if (!tx && eventId) {
      tx = await Transaction.findOne({ eventId, type: "deposit", status: "pending", amount }).sort({ createdAt: -1 });
    }

    if (!tx) {
      console.warn("Webhook: no matching pending deposit", { intentId, eventId, amount });
      return res.status(200).json({ received: true });
    }

    const wallet = await Wallet.findOne({ eventId: tx.eventId });
    if (!wallet) {
      return res.status(500).json({ msg: "Wallet not found" });
    }

    tx.status = "completed";
    tx.finternetTxId = txId || intentId;
    await tx.save();

    wallet.balance += tx.amount;
    await wallet.save();

    // STEP 5: Update participant depositedAmount for settlement
    const event = await Event.findById(tx.eventId);
    if (event) {
      const participant = event.participants.find(
        (p) => p.userId.toString() === tx.userId.toString()
      );
      if (participant) {
        participant.depositedAmount = (participant.depositedAmount || 0) + tx.amount;
        await event.save();
      }
    }

    return res.status(200).json({ received: true });
  }

  return res.status(200).json({ received: true });
};

module.exports = { finternetWebhook };
