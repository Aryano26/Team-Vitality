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
  const [spending, setSpending] = useState(false);
  const [poll, setPoll] = useState(null);
  const [voting, setVoting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [ledger, setLedger] = useState(null);

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
      return data.transactions || [];
    } catch (err) {
      setTransactions([]);
      return [];
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

  const fetchPoll = async () => {
    try {
      const { data } = await api.get(`/events/${id}/poll/top-up`);
      setPoll(data.poll || null);
    } catch {
      setPoll(null);
    }
  };

  const fetchLedger = async () => {
    try {
      const { data } = await api.get(`/events/${id}/settlement/ledger`);
      setLedger(data.ledger || null);
    } catch {
      setLedger(null);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await fetchEvent();
    await fetchWallet();
    const txData = await fetchTransactions();
    await fetchCategories();
    await fetchPoll();
    await fetchLedger();
    
    // Auto-sync wallet if there are pending deposits
    const txList = txData || transactions || [];
    const pendingDeposits = txList.filter(tx => tx.type === "deposit" && tx.status === "pending");
    if (pendingDeposits.length > 0) {
      try {
        await api.post(`/events/${id}/wallet/sync`);
        await fetchWallet();
        await fetchTransactions();
      } catch (err) {
        // Silent fail - user can manually sync if needed
        console.log("Auto-sync failed:", err);
      }
    }
    
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const depositStatus = searchParams.get("deposit");
    if (depositStatus === "success") {
      setSearchParams({});
      sessionStorage.removeItem("pendingDepositEventId");
      toast.success("Payment successful! Wallet updated.");
      // Small delay to ensure backend has processed the payment
      setTimeout(() => {
        loadAll();
      }, 500);
    } else if (depositStatus === "cancelled") {
      setSearchParams({});
      sessionStorage.removeItem("pendingDepositEventId");
      toast.info("Payment cancelled.");
    }
  }, [searchParams]);

  // Clear pending deposit event when we're on this event (so "Return to event" banner hides)
  useEffect(() => {
    if (id && sessionStorage.getItem("pendingDepositEventId") === id) {
      sessionStorage.removeItem("pendingDepositEventId");
    }
  }, [id]);

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
        // Remember event so we can show "Back to event" after payment redirect
        sessionStorage.setItem("pendingDepositEventId", id);
        // Small delay to ensure transaction is saved before redirect
        setTimeout(() => {
          window.location.href = data.paymentUrl;
        }, 300);
        return;
      }

      toast.success(`Deposited ${amount} ${wallet?.currency || "USD"}`);
      e.target.amount.value = "";
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.msg || err.response?.data?.error || "Deposit failed");
    } finally {
      setDepositing(false);
    }
  };

  const handleSpend = async (e) => {
    e.preventDefault();
    const form = e.target;
    const amount = parseFloat(form.amount.value);
    const description = form.description?.value?.trim() || "";
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (amount > (wallet?.balance || 0)) {
      toast.error("Amount exceeds wallet balance");
      return;
    }
    setSpending(true);
    try {
      await api.post(`/events/${id}/payments`, {
        amount,
        description: description || undefined,
      });
      toast.success(`Spent ${amount} ${wallet?.currency || "USD"} from wallet`);
      form.amount.value = "";
      if (form.description) form.description.value = "";
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Spend failed");
    } finally {
      setSpending(false);
    }
  };

  const handleStartEvent = async () => {
    try {
      const { data } = await api.post(`/events/${id}/start`);
      setEvent(data.event);
      toast.success(data.message || "Event started");
      await fetchPoll();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to start event");
    }
  };

  const handleStopEvent = async () => {
    try {
      const { data } = await api.post(`/events/${id}/stop`);
      setEvent(data.event);
      toast.success(data.message || "Event ended");
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to end event");
    }
  };

  const handlePollVote = async (vote) => {
    setVoting(true);
    try {
      const { data } = await api.post(`/events/${id}/poll/top-up/vote`, { vote });
      setEvent(data.event);
      setPoll(data.poll || null);
      toast.success(data.poll?.message || "Vote recorded");
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Vote failed");
    } finally {
      setVoting(false);
    }
  };

  const handleSyncWallet = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post(`/events/${id}/wallet/sync`);
      toast.success(data.message || `Synced wallet. Balance updated to ${data.newBalance} ${wallet?.currency || "USD"}`);
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <div className="events-page"><p>Loading...</p></div>;
  if (!event) return null;

  const canDeposit =
    event.status === "scheduled" ||
    (event.status === "active" && (event.topUpAllowed || !event.startDateTime));
  const isCreator = user && event.createdBy && event.createdBy._id === user._id;

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

        {isCreator && (
          <div className="event-actions-row">
            {event.status === "scheduled" && (
              <button type="button" className="btn-primary" onClick={handleStartEvent}>
                Start Event
              </button>
            )}
            {event.status === "active" && (
              <button type="button" className="btn-secondary" onClick={handleStopEvent}>
                End Event
              </button>
            )}
          </div>
        )}

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span className="wallet-label">Shared Wallet Balance</span>
              <button
                type="button"
                className="btn-secondary btn-sync"
                onClick={handleSyncWallet}
                disabled={syncing}
                title="Sync wallet to process any pending deposits"
              >
                {syncing ? "Syncing..." : "🔄 Sync"}
              </button>
            </div>
            <span className="wallet-amount">
              {(typeof wallet?.balance === "number" ? wallet.balance : parseFloat(wallet?.balance) || 0).toFixed(2)}{" "}
              {wallet?.currency || "USD"}
            </span>
          </div>

          {canDeposit && (
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
          {event.status === "active" && !canDeposit && (wallet?.balance || 0) > 0 && (
            <p className="wallet-locked-msg">Wallet is locked. Spend from the basket below or vote in the poll when balance is zero.</p>
          )}

          {event.status === "active" && (wallet?.balance || 0) > 0 && (
            <form className="spend-form deposit-form" onSubmit={handleSpend}>
              <input
                type="number"
                name="amount"
                placeholder="Amount to spend"
                min="0.01"
                step="0.01"
                max={wallet?.balance || 0}
                required
              />
              <input type="text" name="description" placeholder="What for (optional)" />
              <button type="submit" disabled={spending}>
                {spending ? "Spending..." : "Spend from wallet"}
              </button>
            </form>
          )}

          {poll?.active && (
            <div className="poll-box">
              <h4>Wallet is empty. Add more money?</h4>
              <p className="poll-meta">
                {poll.votedCount} / {poll.totalMembers} voted
              </p>
              {!poll.hasVoted ? (
                <div className="poll-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handlePollVote("add")}
                    disabled={voting}
                  >
                    Yes, add more
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handlePollVote("no")}
                    disabled={voting}
                  >
                    No
                  </button>
                </div>
              ) : (
                <p className="poll-wait">Waiting for others to vote...</p>
              )}
            </div>
          )}
          {poll?.result && !poll?.active && (
            <p className="poll-result">
              {poll.result === "add"
                ? "Majority voted to add more money. You can deposit again above."
                : "Majority voted no. Deposits remain locked."}
            </p>
          )}
          {event.status === "ended" && (
            <div className="event-ended-info">
              <h4 className="final-balance-title">Final Wallet Balance</h4>
              <p className="final-balance-amount">
                {(typeof wallet?.balance === "number" ? wallet.balance : parseFloat(wallet?.balance) || 0).toFixed(2)}{" "}
                {wallet?.currency || "USD"}
              </p>
              {isCreator && (
                <p className="settlement-msg">
                  Event ended. Use the settlement API to refund remaining balance to participants.
                </p>
              )}
            </div>
          )}
        </div>

        {ledger && (
          <div className="ledger-section">
            <h3>Members Ledger</h3>
            <div className="ledger-summary">
              <span>Total deposited: <strong>{ledger.totalDeposited?.toFixed(2)} {ledger.currency}</strong></span>
              <span>Total spent: <strong>{ledger.totalSpent?.toFixed(2)} {ledger.currency}</strong></span>
              <span>Remaining: <strong>{ledger.remainingBalance?.toFixed(2)} {ledger.currency}</strong></span>
            </div>
            <p className="ledger-note">Remaining amount is split by deposit ratio (e.g. 200:300:100 → 2:3:1).</p>
            <ul className="ledger-list">
              {ledger.members?.map((m) => (
                <li key={m.userId} className="ledger-member">
                  <span className="ledger-name">{m.name || "Member"}</span>
                  <span className="ledger-deposited">Deposited: {m.deposited?.toFixed(2)} {ledger.currency}</span>
                  <span className="ledger-ratio">Ratio: {m.ratio}%</span>
                  <span className="ledger-refund">Refund: {m.refundAmount?.toFixed(2)} {ledger.currency}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="categories-section">
          <h3>Expense Categories</h3>
          {(event.status === "active" || event.status === "scheduled") && (
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
                  {(event.status === "active" || event.status === "scheduled") && user && (
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