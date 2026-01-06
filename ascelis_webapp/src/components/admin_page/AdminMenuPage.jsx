import React from "react";
import "../../css/adminmenu.css"; 
import { Link } from "react-router-dom";

export default function AdminMenuPage() {
  return (
    <div className="admin-wrapper">
      {/* Top header with logo and app name */}
      <header className="admin-header">
        <img src="/assets/img/ascelis_logo.png" alt="ASCELIS Logo" className="admin-logo" />
        <h1 className="admin-title">Admin Menu</h1>
      </header>

      {/* Main content: one row, two columns */}
      <div className="admin-main">
        {/* Left column: Manage Users */}
        <div className="admin-box">
          <img src="/assets/img/manage_user_btn.png" alt="ASCELIS Logo" className="admin-logo" />
          <h2>Manage Users</h2>
          <p>Approve or reject user account status here.</p>
          <Link to="/admin/account_verification">
            <button className="go-btn" >
              Go
            </button> 
          </Link>
        </div>

        {/* Right column: Realtime Tracking */}
        <div className="admin-box">
          <img src="/assets/img/tracking_btn.png" alt="ASCELIS Logo" className="admin-logo" />
          <h2>Realtime Tracking</h2>
          <p>View users' current locations and movements.</p>
          <Link to="/admin/dashboard">
            <button className="go-btn" >
              Go
            </button> 
          </Link>
        </div>
      </div>
    </div>
  );
}
