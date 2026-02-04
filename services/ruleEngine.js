/**
 * Rule engine: validates payment (expense) against event and category rules.
 * Used before creating/executing an expense. Does NOT mutate state.
 */

/**
 * Validate a payment (expense) from the shared wallet.
 * Rules: event ACTIVE, category ACTIVE, payer in category, payer authorized,
 * amount <= category budget, amount <= wallet balance. If approval required, returns requiresApproval.
 *
 * @param {Object} params
 * @param {Object} event - Event document (with categories populated or embedded)
 * @param {Object} category - Category subdoc or object (with participantIds, spendLimit, status, authorizedPayers, approvalRules)
 * @param {string} payerUserId - User ID making the payment
 * @param {number} amount - Expense amount
 * @param {number} walletBalance - Current wallet balance
 * @param {number} [categoryCurrentSpend] - Current total spend in this category (for budget check)
 * @returns {{ valid: boolean, reason?: string, requiresApproval?: boolean }}
 */
function validatePayment({ event, category, payerUserId, amount, walletBalance, categoryCurrentSpend = 0 }) {
  const uid = payerUserId.toString();

  if (!event || event.status !== "active") {
    return { valid: false, reason: "Event is not active" };
  }

  // If no category (uncategorized expense), skip category-specific checks
  if (category) {
    if (category.status && category.status !== "active") {
      return { valid: false, reason: "Category is not active" };
    }
    // Payer must be in category (at time of check; for executed expense we use locked snapshot)
    const participantIds = category.participantIds || [];
    const isInCategory = participantIds.some((id) => id.toString() === uid);
    if (!isInCategory) {
      return { valid: false, reason: "You must join this category before spending from it" };
    }
    // Authorized payers: empty = all participants; otherwise must be in list
    const authorizedPayers = category.authorizedPayers || [];
    if (authorizedPayers.length > 0) {
      const isAuthorized = authorizedPayers.some((id) => id.toString() === uid);
      if (!isAuthorized) {
        return { valid: false, reason: "You are not an authorized payer for this category" };
      }
    }
  }

  // Payer must be event participant
  const isEventParticipant = event.participants.some((p) => p.userId.toString() === uid);
  if (!isEventParticipant) {
    return { valid: false, reason: "You are not a participant in this event" };
  }

  // Event-level role check (defaultSpendingRules or legacy paymentRules)
  const rules = event.defaultSpendingRules || event.paymentRules || {};
  const allowedRoles = rules.allowedPayerRoles || ["creator", "member"];
  const participant = event.participants.find((p) => p.userId.toString() === uid);
  const role = participant?.role || "member";
  if (!allowedRoles.includes(role)) {
    return { valid: false, reason: "Your role is not allowed to pay from this basket" };
  }

  // Category budget limit (only when category present)
  if (category) {
    const budgetLimit = category.budgetLimit ?? category.spendLimit ?? null;
    if (budgetLimit != null) {
      const newTotal = categoryCurrentSpend + amount;
      if (newTotal > budgetLimit) {
        return { valid: false, reason: `Expense would exceed category budget (limit: ${budgetLimit})` };
      }
    }
  }

  // Wallet balance
  if (walletBalance < amount) {
    return { valid: false, reason: "Insufficient balance in shared wallet" };
  }

  // Event-level max per category
  const maxPerCategory = rules.maxExpensePerCategory ?? null;
  if (maxPerCategory != null && amount > maxPerCategory) {
    return { valid: false, reason: `Expense exceeds per-category limit of ${maxPerCategory}` };
  }

  // Approval rules: if amount above threshold, require approval (do not deduct yet). Only when category present.
  let requiresApproval = false;
  if (category && category.approvalRules) {
    const approvalRules = category.approvalRules;
    const requireApprovalAbove = approvalRules.requireApprovalAbove ?? null;
    requiresApproval = requireApprovalAbove != null && amount > requireApprovalAbove;
  }

  return { valid: true, requiresApproval };
}

module.exports = { validatePayment };
