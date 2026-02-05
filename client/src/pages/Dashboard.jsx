import React, { useEffect, useState } from 'react'
import { HiOutlineCalendarDays } from 'react-icons/hi2';
import "../styles/Dashboard.css";
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

const Dashboard = () => {
  const [ token ] = useState(JSON.parse(localStorage.getItem("auth")) || "");
  const navigate = useNavigate();

  useEffect(() => {
    if(token === ""){
      navigate("/login");
      toast.warn("Please login first to access dashboard");
    }
  }, [token, navigate]);

  return (
    <div className='dashboard-main'>
      <div className="dashboard-hero">
        <div className="dashboard-hero-glow" />
        <h1>Dashboard</h1>
        <p className="dashboard-subtitle">Your command center</p>
      </div>
      <div className="dashboard-cards">
        <Link to="/events" className="dashboard-card dashboard-card-primary">
          <span className="dashboard-card-icon">
            <HiOutlineCalendarDays />
          </span>
          <h3>My Events</h3>
          <p>View and manage your events</p>
          <span className="dashboard-card-arrow">→</span>
        </Link>
      </div>
    </div>
  )
}

export default Dashboard