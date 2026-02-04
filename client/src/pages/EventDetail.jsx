import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import "../styles/Events.css";

const EventDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [depositing, setDepositing] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [joiningCategory, setJoiningCategory] = useState(null);
  const [summary, setSummary] = useState(null);
  const [creatingExpense, setCreatingExpense] = useState(false);
  const [settling, setSettling] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [approvingExpenseId, setApprovingExpenseId] = useState(null);
  const [settlementStatus, setSettlementStatus] = useState(null);
  const [settlementCalculated, setSettlementCalculated] = useState(null);
  const [executingSettlement, setExecutingSettlement] = useState(false);
  const [processingRefundId, setProcessingRefundId] = useState(null);
  const [completingSettlement, setCompletingSettlement] = useState(false);

  const fetchEvent = async () => {
    try {
      const { data } = await api.get(`/events/${id}`);
      setEvent(data.event);
    } catch (err) {
      if (err.response?.status === 401) {
        navigate("/login");
      } else {
        toast.error(err.response?.data?.msg || "Event not found");
        navigate("/events");
      }
    }
  };

  const fetchWallet = async () => {
    try {
      const { data } = await api.get(`/events/${id}/wallet`);
      setWallet(data.wallet);
    } catch (err) {
      if (err.response?.status !== 401) {
        setWallet({ balance: 0, currency: "USD" });
      }
    }
  };

  const fetchTransactions = async () => {
    try {
      const { data } = await api.get(`/events/${id}/wallet/transactions`);
      setTransactions(data.transactions || []);
    } catch (err) {
      setTransactions([]);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data } = await api.get(`/events/${id}/categories`);
      setCategories(data.categories || []);
    } catch {
      setCategories([]);
    }
  };

  const fetchSummary = async () => {
    try {
      const { data } = await api.get(`/events/${id}/summary`);
      setSummary(data);
    } catch {
      setSummary(null);
    }
  };

  const fetchExpenses = async () => {
    try {
      const { data } = await api.get(`/events/${id}/expenses`);
      setExpenses(data.expenses || []);
    } catch {
      setExpenses([]);
    }
  };

  const fetchSettlementStatus = async () => {
    try {
      const { data } = await api.get(`/events/${id}/settlement`);
      setSettlementStatus(data);
    } catch {
      setSettlementStatus(null);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await fetchEvent();
    await fetchWallet();
    await fetchTransactions();
    await fetchCategories();
    await fetchSummary();
    await fetchExpenses();
    await fetchSettlementStatus();
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const depositStatus = searchParams.get("deposit");
    if (depositStatus === "success") {
      setSearchParams({});
      toast.success("Payment successful! Wallet updated.");
      loadAll();
    } else if (depositStatus === "cancelled") {
      setSearchParams({});
      toast.info("Payment cancelled.");
    }
  }, [searchParams]);

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value?.trim();
    const spendLimit = form.spendLimit.value ? parseFloat(form.spendLimit.value) : null;
    if (!name) {
      toast.error("Category name is required");
      return;
    }
    setCreatingCategory(true);
    try {
      await api.post(`/events/${id}/categories`, { name, spendLimit });
      toast.success("Category created");
      form.reset();
      await fetchCategories();
      await fetchEvent();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to create category");
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleJoinCategory = async (categoryId) => {
    setJoiningCategory(categoryId);
    try {
      await api.put(`/events/${id}/categories/${categoryId}/join`);
      toast.success("Joined category");
      await fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to join");
    } finally {
      setJoiningCategory(null);
    }
  };

  const handleLeaveCategory = async (categoryId) => {
    setJoiningCategory(categoryId);
    try {
      await api.put(`/events/${id}/categories/${categoryId}/leave`);
      toast.success("Left category");
      await fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to leave");
    } finally {
      setJoiningCategory(null);
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(e.target.amount.value);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setDepositing(true);
    try {
      const { data } = await api.post(`/events/${id}/wallet/deposits`, { amount });

      if (data.paymentUrl) {
        toast.info("Redirecting to payment...");
        window.location.href = data.paymentUrl;
        return;
      }

      toast.success(`Deposited ${amount} ${wallet?.currency || "USD"}`);
      e.target.amount.value = "";
      await fetchWallet();
      await fetchTransactions();
      await fetchSummary();
    } catch (err) {
      toast.error(err.response?.data?.msg || err.response?.data?.error || "Deposit failed");
    } finally {
      setDepositing(false);
    }
  };

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    const form = e.target;
    const amount = parseFloat(form.amount.value);
    const categoryId = form.categoryId.value?.trim() || null;
    const description = form.description.value?.trim() || "";
    const receiptImageUrl = form.receiptImageUrl.value?.trim() || "";

    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    // Require category selection for rule-based payment
    if (!categoryId) {
      toast.error("Please select a category");
      return;
    }

    setCreatingExpense(true);
    try {
      const { data } = await api.post(`/events/${id}/expenses`, {
        amount,
        categoryId,
        description,
        receiptImageUrl,
      });
      // Handle backend response: pending approval vs paid (approved)
      if (data.expense?.status === "pending") {
        toast.info("Expense submitted; pending approval before payment.");
      } else {
        toast.success("Expense recorded from shared wallet");
      }
      form.reset();
      form.categoryId.value = "";
      await fetchWallet();
      await fetchTransactions();
      await fetchCategories();
      await fetchSummary();
      await fetchExpenses();
    } catch (err) {
      const msg = err.response?.data?.msg || err.response?.data?.error || err.message;
      toast.error(msg);
    } finally {
      setCreatingExpense(false);
    }
  };

  const handleApproveExpense = async (expenseId) => {
    setApprovingExpenseId(expenseId);
    try {
      await api.post(`/events/${id}/expenses/${expenseId}/approve`);
      toast.success("Expense approved and paid from wallet");
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Approval failed");
    } finally {
      setApprovingExpenseId(null);
    }
  };

  const handleCloseCategory = async (categoryId) => {
    if (!window.confirm("Close this category? No new expenses can be added to it.")) return;
    try {
      await api.patch(`/events/${id}/categories/${categoryId}/close`);
      toast.success("Category closed");
      await fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to close category");
    }
  };

  const handleSettleEvent = async () => {
    if (!window.confirm("Settle this event? This will calculate final shares for all participants.")) {
      return;
    }
    setSettling(true);
    try {
      const { data } = await api.post(`/events/${id}/settle`);
      toast.success("Event settled. Final shares calculated.");
      await fetchEvent();
      await fetchSummary();
      setEvent((prev) => (prev ? { ...prev, status: data.status } : prev));
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to settle event");
    } finally {
      setSettling(false);
    }
  };

  // Settlement & Refunds flow (backend: /api/v1/events/:eventId/settlement/...)
  const handleCalculateSettlement = async () => {
    try {
      const { data } = await api.get(`/events/${id}/settlement/calculate`);
      setSettlementCalculated(data);
      toast.success("Settlement calculated");
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to calculate settlement");
    }
  };

  const handleExecuteSettlement = async () => {
    if (!window.confirm("Execute settlement? This will create refund transactions and deduct from the shared wallet for over-paid participants.")) return;
    setExecutingSettlement(true);
    try {
      await api.post(`/events/${id}/settlement/execute`);
      toast.success("Settlement executed. Process refunds for each participant, then complete settlement.");
      await fetchSettlementStatus();
      await fetchEvent();
      await fetchWallet();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to execute settlement");
    } finally {
      setExecutingSettlement(false);
    }
  };

  const handleProcessRefund = async (participantId) => {
    setProcessingRefundId(participantId);
    try {
      await api.post(`/events/${id}/settlement/refund/${participantId}`);
      toast.success("Refund processed");
      await fetchSettlementStatus();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Refund failed");
    } finally {
      setProcessingRefundId(null);
    }
  };

  const handleCompleteSettlement = async () => {
    if (!window.confirm("Complete settlement? Event and wallet will be closed.")) return;
    setCompletingSettlement(true);
    try {
      await api.patch(`/events/${id}/settlement/complete`);
      toast.success("Settlement completed. Event closed.");
      await fetchEvent();
      await fetchSettlementStatus();
      await fetchWallet();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to complete settlement");
    } finally {
      setCompletingSettlement(false);
    }
  };

  if (loading) return <div className="events-page"><p>Loading...</p></div>;
  if (!event) return null;

  return (
    <div className="events-page">
      <div className="events-header">
        <Link to="/events" className="btn-secondary">← Back to Events</Link>
      </div>
      <div className="event-detail">
        <div className="event-detail-header">
          <span className="event-type-badge">{event.type}</span>
          <span className={`event-status-badge event-status-${(event.status || "active").toLowerCase()}`}>
            {(event.status || "active").toUpperCase()}
          </span>
        </div>
        <h1>{event.name}</h1>
        {event.description && <p>{event.description}</p>}
        <p className="event-meta">
          {event.participants?.length || 0} participants
          {event.settlementTrigger && ` · Settlement: ${event.settlementTrigger}`}
        </p>

        {/* Event dashboard: wallet balance, total spent, remaining (all from backend summary) */}
        <div className="event-dashboard-stats">
          <div className="stat-card">
            <span className="stat-label">Wallet balance</span>
            <span className="stat-value">
              {wallet?.balance?.toFixed(2) ?? "0.00"} {wallet?.currency || "USD"}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Total spent</span>
            <span className="stat-value">
              {summary?.participants?.length
                ? summary.participants.reduce((s, p) => s + (p.totalExpenses || 0), 0).toFixed(2)
                : "0.00"}{" "}
              {summary?.wallet?.currency || wallet?.currency || "USD"}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Remaining balance</span>
            <span className="stat-value">
              {wallet?.balance?.toFixed(2) ?? "0.00"} {wallet?.currency || "USD"}
            </span>
          </div>
        </div>

        {user && event.createdBy && event.createdBy._id === user._id && (
          <div className="event-share-box">
            <p>
              <strong>Share this event</strong>
            </p>
            <p className="event-id-line">
              Event ID: <code>{event._id}</code>
              <button
                type="button"
                className="btn-secondary btn-copy-id"
                onClick={() => {
                  navigator.clipboard
                    .writeText(event._id)
                    .then(() => toast.success("Event ID copied to clipboard"))
                    .catch(() => toast.error("Could not copy ID"));
                }}
              >
                Copy
              </button>
            </p>
            <p className="event-share-help">
              Share this ID with friends so they can join from the "Join an existing event" box.
            </p>
          </div>
        )}

        <div className="wallet-section">
          <div className="wallet-balance">
            <span className="wallet-label">Shared Wallet Balance</span>
            <span className="wallet-amount">
              {wallet?.balance?.toFixed(2) ?? "0.00"} {wallet?.currency || "USD"}
            </span>
          </div>
          <p className="wallet-info-message">
            Deposits are pooled in the shared wallet and settled automatically (fair share per participant) when the event is settled.
          </p>

          {event.status === "active" && (
            <form className="deposit-form" onSubmit={handleDeposit}>
              <input
                type="number"
                name="amount"
                placeholder="Amount to deposit"
                min="0.01"
                step="0.01"
                required
              />
              <button type="submit" disabled={depositing}>
                {depositing ? "Processing..." : "Deposit"}
              </button>
            </form>
          )}
        </div>

        {event.status === "active" && (
          <div className="expenses-section">
            <h3>Pay from shared basket</h3>
            <p className="expense-form-hint">
              Category is required. Wallet balance and remaining category budget are enforced by the backend.
            </p>
            <div className="expense-form-balances">
              <span>Wallet: {wallet?.balance?.toFixed(2) ?? "0.00"} {wallet?.currency || "USD"}</span>
              <span id="expense-remaining-budget" className="expense-remaining-budget">
                Select a category to see remaining budget
              </span>
            </div>
            <form className="expense-form" onSubmit={handleCreateExpense} id="expense-form">
              <input
                type="number"
                name="amount"
                placeholder="Expense amount"
                min="0.01"
                step="0.01"
                required
              />
              <select
                name="categoryId"
                required
                aria-required="true"
                onChange={(e) => {
                  const catId = e.target.value;
                  const el = document.getElementById("expense-remaining-budget");
                  if (!el) return;
                  if (!catId) {
                    el.textContent = "Select a category to see remaining budget";
                    return;
                  }
                  const cat = categories.find((c) => c._id === catId);
                  if (cat) {
                    const rem = cat.remaining != null ? cat.remaining.toFixed(2) : "—";
                    const limit = cat.spendLimit != null ? ` (limit ${cat.spendLimit.toFixed(2)})` : "";
                    el.textContent = `Remaining: ${rem} ${wallet?.currency || "USD"}${limit}`;
                  }
                }}
              >
                <option value="">Select category (required)</option>
                {categories.filter((c) => c.status !== "closed").map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
                    {cat.remaining != null ? ` (${cat.remaining.toFixed(2)} left)` : ""}
                  </option>
                ))}
              </select>
              <input
                type="text"
                name="description"
                placeholder="Description (optional)"
              />
              <input
                type="text"
                name="receiptImageUrl"
                placeholder="Receipt image URL (optional)"
              />
              <button type="submit" disabled={creatingExpense}>
                {creatingExpense ? "Saving..." : "Add Expense"}
              </button>
            </form>
          </div>
        )}

        <div className="categories-section">
          <h3>Expense Categories</h3>
          {event.status === "active" && (
            <form className="create-category-form" onSubmit={handleCreateCategory}>
              <input type="text" name="name" placeholder="Category name (e.g., Food)" required />
              <input
                type="number"
                name="spendLimit"
                placeholder="Spend limit (optional)"
                min="0"
                step="0.01"
              />
              <button type="submit" disabled={creatingCategory}>
                {creatingCategory ? "Creating..." : "Add Category"}
              </button>
            </form>
          )}
          {categories.length === 0 ? (
            <p className="categories-empty">No categories yet. Add one to organize expenses.</p>
          ) : (
            <ul className="categories-list">
              {categories.map((cat) => (
                <li key={cat._id} className="category-card">
                  <div className="category-header">
                    <span className="category-name">{cat.name}</span>
                    <span className={`category-status-badge category-status-${(cat.status || "active").toLowerCase()}`}>
                      {(cat.status || "active").toUpperCase()}
                    </span>
                    <span className="category-spend">
                      {cat.currentSpend?.toFixed(2) ?? "0.00"}
                      {cat.spendLimit != null ? ` / ${cat.spendLimit.toFixed(2)}` : ""} {wallet?.currency || "USD"}
                    </span>
                  </div>
                  {cat.budgetLimit != null && (
                    <div className="category-budget">Budget limit: {cat.budgetLimit.toFixed(2)} {wallet?.currency || "USD"}</div>
                  )}
                  {cat.spendLimit != null && cat.remaining != null && (
                    <div className="category-remaining">
                      {cat.remaining.toFixed(2)} remaining
                    </div>
                  )}
                  {cat.approvalRules?.requireApprovalAbove != null && (
                    <p className="category-approval-hint">
                      Approval required for payments above {cat.approvalRules.requireApprovalAbove.toFixed(2)} {wallet?.currency || "USD"}
                    </p>
                  )}
                  <p className="category-participants">
                    {cat.participants?.length || 0} participants
                    {cat.participants?.length ? `: ${cat.participants.map((p) => p.name).join(", ")}` : ""}
                  </p>
                  <div className="category-actions">
                    {event.status === "active" && user && cat.status !== "closed" && (
                      <button
                        type="button"
                        className={`btn-category ${cat.isParticipant ? "btn-leave" : "btn-join"}`}
                        onClick={() =>
                          cat.isParticipant ? handleLeaveCategory(cat._id) : handleJoinCategory(cat._id)
                        }
                        disabled={joiningCategory === cat._id}
                      >
                        {joiningCategory === cat._id ? "..." : cat.isParticipant ? "Leave" : "Join"}
                      </button>
                    )}
                    {event.status === "active" && user && event.createdBy?._id === user._id && cat.status === "active" && (
                      <button
                        type="button"
                        className="btn-category btn-close-category"
                        onClick={() => handleCloseCategory(cat._id)}
                      >
                        Close category
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Approval UI: show pending expenses; approvers can approve (creator or category approvers) */}
        {event.status === "active" && expenses.filter((ex) => ex.status === "pending").length > 0 && (
          <div className="approval-section">
            <h3>Pending approvals</h3>
            <p className="approval-hint">Expenses above category threshold require approval before payment from wallet.</p>
            <ul className="pending-expenses-list">
              {expenses
                .filter((ex) => ex.status === "pending")
                .map((ex) => (
                  <li key={ex._id} className="pending-expense-item">
                    <span>
                      {ex.amount.toFixed(2)} {ex.currency} – {ex.description || "No description"}
                      {ex.paidBy?.name && ` (by ${ex.paidBy.name})`}
                    </span>
                    {user && (event.createdBy?._id === user._id || event.createdBy === user._id) && (
                      <button
                        type="button"
                        className="btn-primary btn-approve"
                        onClick={() => handleApproveExpense(ex._id)}
                        disabled={approvingExpenseId === ex._id}
                      >
                        {approvingExpenseId === ex._id ? "Approving..." : "Approve"}
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="transactions-section">
          <h3>Recent Activity</h3>
          {transactions.length === 0 ? (
            <p className="transactions-empty">No transactions yet. Make a deposit to get started.</p>
          ) : (
            <ul className="transactions-list">
              {transactions.map((tx) => (
                <li key={tx._id} className={`transaction-item transaction-${tx.type}`}>
                  <span className="tx-type">{tx.type}</span>
                  <span className="tx-amount">
                    {tx.type === "deposit" ? "+" : "-"}
                    {tx.amount.toFixed(2)} {tx.currency}
                  </span>
                  <span className="tx-user">{tx.userId?.name || "User"}</span>
                  <span className="tx-date">
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {summary && (
          <div className="summary-section">
            <h3>Settlement summary</h3>
            <p className="summary-hint">Per-participant: deposited amount, fair share (spent), and net (refund or payable). All values from backend.</p>
            {summary.participants && summary.participants.length > 0 ? (
              <table className="summary-table">
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Deposited</th>
                    <th>Fair share</th>
                    <th>Net (refund / payable)</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.participants.map((p) => (
                    <tr key={typeof p.userId === "object" ? p.userId?._id : p.userId}>
                      <td>
                        {p.name} ({p.email})
                      </td>
                      <td>{(p.totalDeposits ?? 0).toFixed(2)} {summary.wallet?.currency || event.currency}</td>
                      <td>{(p.totalExpenses ?? 0).toFixed(2)} {summary.wallet?.currency || event.currency}</td>
                      <td className={p.net > 0 ? "net-refund" : p.net < 0 ? "net-payable" : ""}>
                        {(p.net ?? 0).toFixed(2)} {summary.wallet?.currency || event.currency}
                        {p.net > 0 && " (refund)"}
                        {p.net < 0 && " (payable)"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No participant activity yet.</p>
            )}

            {/* Per-category breakdown: total spent and participants (from categories state) */}
            {categories.length > 0 && (
              <div className="summary-by-category">
                <h4>By category</h4>
                <ul className="summary-category-list">
                  {categories.map((cat) => (
                    <li key={cat._id}>
                      <strong>{cat.name}</strong>
                      <span>Total spent: {(cat.currentSpend ?? 0).toFixed(2)} {wallet?.currency || "USD"}</span>
                      <span>Participants: {cat.participants?.length ?? 0} ({cat.participants?.map((p) => p.name).join(", ") || "—"})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="settlement-section">
              <h4>Settlement</h4>
              {summary.settlementSummary ? (
                <p>
                  Settlement status: {summary.settlementSummary.status}.{" "}
                  {summary.settlementSummary.calculatedAt &&
                    `Calculated at ${new Date(summary.settlementSummary.calculatedAt).toLocaleString()}`}
                </p>
              ) : (
                <p>Event has not been settled yet.</p>
              )}
              {user && event.createdBy && event.createdBy._id === user._id && event.status !== "settled" && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSettleEvent}
                  disabled={settling}
                >
                  {settling ? "Settling..." : "Settle Event"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Settlement & Refunds: full flow (calculate → execute → process refunds → complete). Backend: /api/v1/events/:eventId/settlement/... */}
        <div className="settlement-refunds-section">
          <h3>Settlement &amp; Refunds</h3>
          <p className="settlement-refunds-hint">
            Flow: (1) Calculate settlement → (2) Execute settlement (create refund txs, deduct wallet) → (3) Process refund per participant → (4) Complete settlement (close event &amp; wallet).
          </p>

          {settlementStatus && (
            <div className="settlement-status-block">
              <p><strong>Event status:</strong> {settlementStatus.eventStatus}</p>
              <p><strong>Wallet balance:</strong> {settlementStatus.walletBalance?.toFixed(2) ?? "0.00"} {wallet?.currency || "USD"}</p>
              {settlementStatus.settlements?.length > 0 && (
                <ul className="settlement-refunds-list">
                  {settlementStatus.settlements.map((s) => (
                    <li key={s._id} className="settlement-refund-item">
                      <span>{s.participantId?.name ?? s.participantId ?? "—"}</span>
                      <span>Refund: {(s.refundAmount ?? 0).toFixed(2)} {wallet?.currency || "USD"}</span>
                      <span className={`refund-status refund-status-${s.refundStatus || "pending"}`}>{s.refundStatus || "pending"}</span>
                      {user && event.createdBy && (event.createdBy._id === user._id || event.createdBy === user._id) && (s.refundStatus === "pending" && (s.refundAmount ?? 0) > 0) && (
                        <button
                          type="button"
                          className="btn-primary btn-process-refund"
                          onClick={() => handleProcessRefund(String(s.participantId?._id ?? s.participantId))}
                          disabled={processingRefundId === String(s.participantId?._id ?? s.participantId)}
                        >
                          {processingRefundId === String(s.participantId?._id ?? s.participantId) ? "Processing..." : "Process refund"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {settlementCalculated && (
            <div className="settlement-calculated-block">
              <h4>Calculated settlement</h4>
              <p>Total deposited: {settlementCalculated.totalDeposited?.toFixed(2) ?? "0.00"} · Total expenses: {settlementCalculated.totalExpenses?.toFixed(2) ?? "0.00"}</p>
              {settlementCalculated.settlement && Object.entries(settlementCalculated.settlement).map(([pid, s]) => (
                <div key={pid}>Participant {pid}: deposited {s.totalDeposited?.toFixed(2)}, refund {s.refundAmount?.toFixed(2)}</div>
              ))}
            </div>
          )}

          <div className="settlement-refunds-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleCalculateSettlement}
            >
              Calculate settlement
            </button>
            {user && event.createdBy && (event.createdBy._id === user._id || event.createdBy === user._id) && event.status === "active" && (
              <button
                type="button"
                className="btn-primary"
                onClick={handleExecuteSettlement}
                disabled={executingSettlement}
              >
                {executingSettlement ? "Executing..." : "Execute settlement"}
              </button>
            )}
            {user && event.createdBy && (event.createdBy._id === user._id || event.createdBy === user._id) && (event.status === "settling" || event.status === "active") && settlementStatus?.settlements?.length > 0 && settlementStatus.settlements.filter((s) => (s.refundAmount ?? 0) > 0).every((s) => s.refundStatus === "completed") && (
              <button
                type="button"
                className="btn-primary"
                onClick={handleCompleteSettlement}
                disabled={completingSettlement}
              >
                {completingSettlement ? "Completing..." : "Complete settlement"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventDetail;
