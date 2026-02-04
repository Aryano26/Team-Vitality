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

  const loadAll = async () => {
    setLoading(true);
    await fetchEvent();
    await fetchWallet();
    await fetchTransactions();
    await fetchCategories();
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
    } catch (err) {
      toast.error(err.response?.data?.msg || err.response?.data?.error || "Deposit failed");
    } finally {
      setDepositing(false);
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
      </div>
    </div>
  );
};

export default EventDetail;
