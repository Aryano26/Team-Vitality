import React, { useState, useEffect } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";

const PENDING_EVENT_KEY = "pendingDepositEventId";

const HomeLayout = () => {
  const location = useLocation();
  const [pendingEventId, setPendingEventId] = useState(null);

  useEffect(() => {
    const id = sessionStorage.getItem(PENDING_EVENT_KEY);
    setPendingEventId(id || null);
  }, [location.pathname]);

  const isOnEventPage = pendingEventId && location.pathname === `/events/${pendingEventId}`;
  const showReturnBanner = pendingEventId && !isOnEventPage;

  const handleDismissReturnBanner = () => {
    sessionStorage.removeItem(PENDING_EVENT_KEY);
    setPendingEventId(null);
  };

  return (
    <>
      {showReturnBanner && (
        <div className="return-to-event-banner" role="region" aria-label="Return to event">
          <span className="return-to-event-text">Payment completed. Return to your event?</span>
          <div className="return-to-event-actions">
            <Link to={`/events/${pendingEventId}`} className="btn-primary return-to-event-btn">
              Back to event
            </Link>
            <button
              type="button"
              className="btn-secondary return-to-event-dismiss"
              onClick={handleDismissReturnBanner}
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <Outlet />
    </>
  );
};

export default HomeLayout;