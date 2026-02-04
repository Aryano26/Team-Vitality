import React, { useEffect } from "react";
import "../styles/Logout.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Logout = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    logout();
    setTimeout(() => navigate("/"), 3000);
  }, [logout, navigate]);

  return (
    <div className='logout-main'>
    <h1>Logout Successful!</h1>
    <p>You will be redirected to the landing page in 3 seconds...</p>
  </div>
  )
}

export default Logout