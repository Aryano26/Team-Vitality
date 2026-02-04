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

  const loadAll = async () => {
    setLoading(true);
    await fetchEvent();
    await fetchWallet();
    await fetchTransactions();
    await fetchCategories();
    await fetchSummary();
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
    const categoryId = form.categoryId.value || null;
    const description = form.description.value?.trim() || "";
    const receiptImageUrl = form.receiptImageUrl.value?.trim() || "";

    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setCreatingExpense(true);
    try {
      await api.post(`/events/${id}/expenses`, {
        amount,
        categoryId,
        description,
        receiptImageUrl,
      });
      toast.success("Expense recorded from shared wallet");
      form.reset();
      await fetchWallet();
      await fetchTransactions();
      await fetchCategories();
      await fetchSummary();
    } catch (err) {
      toast.error(err.response?.data?.msg || err.response?.data?.error || "Failed to create expense");
    } finally {
      setCreatingExpense(false);
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

  if (loading) return <div className="events-page"><p>Loading...</p></div>;
  if (!event) return null;

  return (
    <div className="events-page">
      <div className="events-header">
        <Link to="/events" className="btn-secondary">← Back to Events</Link>
      </div>
      <div className="event-detail">
        <span className="event-type-badge">{event.type}</span>
        <h1>{event.name}</h1>
        {event.description && <p>{event.description}</p>}
        <p className="event-meta">
          {event.participants?.length || 0} participants · Status: {event.status}
        </p>

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
            <form className="expense-form" onSubmit={handleCreateExpense}>
              <input
                type="number"
                name="amount"
                placeholder="Expense amount"
                min="0.01"
                step="0.01"
                required
              />
              <select name="categoryId">
                <option value="">No specific category</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
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
                    <span className="category-spend">
                      {cat.currentSpend?.toFixed(2) ?? "0.00"}
                      {cat.spendLimit != null ? ` / ${cat.spendLimit.toFixed(2)}` : ""} {wallet?.currency || "USD"}
                    </span>
                  </div>
                  {cat.spendLimit != null && cat.remaining != null && (
                    <div className="category-remaining">
                      {cat.remaining.toFixed(2)} remaining
                    </div>
                  )}
                  <p className="category-participants">
                    {cat.participants?.length || 0} participants
                    {cat.participants?.length ? `: ${cat.participants.map((p) => p.name).join(", ")}` : ""}
                  </p>
                  {event.status === "active" && user && (
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
                </li>
              ))}
            </ul>
          )}
        </div>

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
            <h3>Participants overview</h3>
            {summary.participants && summary.participants.length > 0 ? (
              <table className="summary-table">
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Deposited</th>
                    <th>Spent</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.participants.map((p) => (
                    <tr key={p.userId}>
                      <td>
                        {p.name} ({p.email})
                      </td>
                      <td>{p.totalDeposits.toFixed(2)} {summary.wallet?.currency || event.currency}</td>
                      <td>{p.totalExpenses.toFixed(2)} {summary.wallet?.currency || event.currency}</td>
                      <td>{p.net.toFixed(2)} {summary.wallet?.currency || event.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No participant activity yet.</p>
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
      </div>
    </div>
  );
};

export default EventDetail;
