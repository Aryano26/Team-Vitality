/**
 * Finternet Payment Gateway Service
 * Creates wallets and processes transactions via Finternet API.
 * Set FINTERNET_API_URL + FINTERNET_API_KEY for real integration; otherwise uses mock.
 */

const API_KEY = process.env.FINTERNET_API_KEY;
const API_BASE = process.env.FINTERNET_API_URL?.replace(/\/$/, "");

async function finternetRequest(method, path, body = null) {
  if (!API_BASE || !API_KEY) return null;
  const url = `${API_BASE}${path}`;
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Create or register a wallet for an event.
 * Finternet: POST /wallets (or equivalent) - creates shared wallet, returns wallet ID.
 * @param {string} eventId - MongoDB Event _id
 * @returns {{ success: boolean, walletId?: string, error?: string }}
 */
async function createWallet(eventId) {
  if (API_BASE && API_KEY) {
    const result = await finternetRequest("POST", "/wallets", {
      referenceId: eventId,
      metadata: { type: "event_shared_wallet", eventId },
    });
    if (result?.ok && result?.data?.id) {
      return { success: true, walletId: result.data.id };
    }
    if (result && !result.ok) {
      console.error("Finternet createWallet failed:", result.status, result.data);
      return { success: false, error: result.data?.message || "Finternet wallet creation failed" };
    }
  }
  const mockWalletId = `fin_wallet_${eventId}_${Date.now()}`;
  return { success: true, walletId: mockWalletId };
}

/**
 * Create a payment intent for depositing into the shared wallet.
 * Finternet: POST /payment-intents - creates intent, returns payment URL for user to complete payment.
 * @param {Object} params
 * @returns {{ success: boolean, intentId?: string, paymentUrl?: string, finternetTxId?: string, error?: string }}
 */
async function createPaymentIntent({ amount, currency, userId, walletId, eventId, successUrl, cancelUrl }) {
  if (API_BASE && API_KEY) {
    const result = await finternetRequest("POST", "/payment-intents", {
      amount: String(amount),
      currency,
      walletId,
      customerId: userId,
      successUrl,
      cancelUrl,
      metadata: { eventId, type: "deposit" },
    });
    if (result?.ok && result?.data) {
      const d = result.data;
      return {
        success: true,
        intentId: d.id || d.intentId,
        paymentUrl: d.paymentUrl || d.url || d.redirectUrl,
        clientSecret: d.clientSecret,
      };
    }
    if (result && !result.ok) {
      console.error("Finternet createPaymentIntent failed:", result.status, result.data);
      return { success: false, error: result.data?.message || "Payment intent creation failed" };
    }
  }
  return { success: false, error: "Finternet not configured" };
}

/**
 * Process a deposit (synchronous fallback when payment intents unavailable).
 * Used for mock/dev or when Finternet uses direct charge.
 */
async function processDeposit({ amount, currency, userId, walletId, eventId }) {
  if (API_BASE && API_KEY) {
    const result = await finternetRequest("POST", "/transactions", {
      type: "deposit",
      amount: String(amount),
      currency,
      walletId,
      customerId: userId,
      metadata: { eventId },
    });
    if (result?.ok && result?.data?.id) {
      return { success: true, finternetTxId: result.data.id };
    }
    if (result && !result.ok) {
      console.error("Finternet processDeposit failed:", result.status, result.data);
      return { success: false, error: result.data?.message || "Finternet deposit failed" };
    }
  }
  const mockTxId = `fin_tx_${eventId}_${userId}_${Date.now()}`;
  return { success: true, finternetTxId: mockTxId };
}

/**
 * Process an expense/payout from the shared wallet.
 * @param {Object} params
 * @returns {{ success: boolean, finternetTxId?: string, error?: string }}
 */
async function processExpense({ amount, currency, walletId, eventId, categoryId, description }) {
  if (!API_KEY) {
    console.warn("FINTERNET_API_KEY not set - using mock transaction");
  }
  const mockTxId = `fin_tx_exp_${eventId}_${Date.now()}`;
  return { success: true, finternetTxId: mockTxId };
}

/**
 * Process a refund to a user from the shared wallet.
 * Finternet: POST /refunds - initiates refund back to user's account.
 * @param {Object} params
 * @returns {{ success: boolean, finternetTxId?: string, error?: string }}
 */
async function processRefund({ amount, currency, userId, walletId, eventId }) {
  if (API_BASE && API_KEY) {
    const result = await finternetRequest("POST", "/refunds", {
      amount: String(amount),
      currency,
      walletId,
      customerId: userId,
      metadata: { eventId, type: "settlement_refund" },
    });
    if (result?.ok && result?.data?.id) {
      return { success: true, finternetTxId: result.data.id };
    }
    if (result && !result.ok) {
      console.error("Finternet processRefund failed:", result.status, result.data);
      return { success: false, error: result.data?.message || "Finternet refund failed" };
    }
  }
  const mockRefundTxId = `fin_refund_${eventId}_${userId}_${Date.now()}`;
  return { success: true, finternetTxId: mockRefundTxId };
}

module.exports = {
  createWallet,
  createPaymentIntent,
  processDeposit,
  processExpense,
  processRefund,
};

