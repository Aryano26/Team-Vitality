import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../lib/api";
import "../styles/Events.css";

const EVENT_TYPES = [
  { value: "trip", label: "Trip" },
  { value: "dinner", label: "Dinner" },
  { value: "movie", label: "Movie" },
  { value: "other", label: "Other" },
];

const Events = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();

  const token = JSON.parse(localStorage.getItem("auth") || '""');

  const fetchEvents = async () => {
    try {
      const { data } = await api.get("/events");
      setEvents(data.events || []);
    } catch (err) {
      if (err.response?.status === 401) {
        navigate("/login");
        toast.warn("Please login first");
      } else {
        toast.error(err.response?.data?.msg || err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate("/login");
      toast.warn("Please login first");
      return;
    }
    fetchEvents();
  }, []);

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value?.trim();
    if (!name) {
      toast.error("Event name is required");
      return;
    }

    setCreating(true);
    try {
      const startVal = form.startDateTime?.value?.trim();
      const endVal = form.endDateTime?.value?.trim();
      const { data } = await api.post("/events", {
        name,
        type: form.type.value || "other",
        description: form.description.value?.trim() || "",
        startDateTime: startVal || undefined,
        endDateTime: endVal || undefined,
      });
      toast.success("Event created!");
      setShowCreateForm(false);
      setEvents((prev) => [data.event, ...prev]);
    } catch (err) {
      toast.error(err.response?.data?.msg || err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinEvent = async (e) => {
    e.preventDefault();
    const form = e.target;
    const code = form.code.value?.trim();
    if (!code) {
      toast.error("Enter an event ID to join");
      return;
    }

    setJoining(true);
    try {
      const { data } = await api.post(`/events/${code}/join`);
      const joinedEvent = data.event;
      toast.success("Joined event!");

      // Add to list if not already present, otherwise update existing entry
      setEvents((prev) => {
        const exists = prev.some((ev) => ev._id === joinedEvent._id);
        if (exists) {
          return prev.map((ev) => (ev._id === joinedEvent._id ? joinedEvent : ev));
        }
        return [joinedEvent, ...prev];
      });

      form.reset();
      navigate(`/events/${joinedEvent._id}`);
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to join event");
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="events-page">
        <p>Loading events...</p>
      </div>
    );
  }

  return (
    <div className="events-page">
      <div className="events-header">
        <h1>Cooper – Your Events</h1>
        <div className="events-actions">
          <Link to="/dashboard" className="btn-secondary">
            Dashboard
          </Link>
          <Link to="/logout" className="btn-secondary">
            Logout
          </Link>
          <button
            className="btn-primary"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? "Cancel" : "+ New Event"}
          </button>
        </div>
      </div>

      <form className="join-event-form" onSubmit={handleJoinEvent}>
        <h3>Join an existing event</h3>
        <input
          type="text"
          name="code"
          placeholder="Paste event ID or code here"
          required
        />
        <button type="submit" disabled={joining}>
          {joining ? "Joining..." : "Join Event"}
        </button>
      </form>

      {showCreateForm && (
        <form className="create-event-form" onSubmit={handleCreateEvent}>
          <h3>Create Event</h3>
          <input
            type="text"
            name="name"
            placeholder="Event name (e.g., Weekend Trip)"
            required
          />
          <select name="type">
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <textarea
            name="description"
            placeholder="Description (optional)"
            rows={2}
          />
          <label className="form-label">Start date & time (optional – when event starts, wallet locks and spending is allowed)</label>
          <input type="datetime-local" name="startDateTime" />
          <label className="form-label">End date & time (optional – after this, you can run settlement)</label>
          <input type="datetime-local" name="endDateTime" />
          <button type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create Event"}
          </button>
        </form>
      )}

      <div className="events-list">
        {events.length === 0 ? (
          <p className="events-empty">
            No events yet. Create one to get started!
          </p>
        ) : (
          events.map((event) => (
            <Link
              to={`/events/${event._id}`}
              key={event._id}
              className="event-card"
            >
              <span className="event-type-badge">{event.type}</span>
              <h3>{event.name}</h3>
              <p className="event-meta">
                {event.participants?.length || 0} participants ·{" "}
                {event.status}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default Events;
