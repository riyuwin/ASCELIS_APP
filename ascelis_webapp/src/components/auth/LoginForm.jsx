import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import "../../css/login.css";

// Firebase imports
import { auth, db } from "../../firebase"; // make sure you export db (Firestore) too
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Link } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); // optional: prevent multiple clicks

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      Swal.fire({
        icon: "warning",
        title: "Missing Fields",
        text: "Please enter both email and password.",
      });
      return;
    }

    setLoading(true);

    try {
      // Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Retrieve user document from Firestore
      const docRef = doc(db, "AccountInformation", user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const userData = docSnap.data();

        // Check accountStatus
        if (userData.accountStatus === "Verified") {
          // Success popup
          Swal.fire({
            icon: "success",
            title: "Login Successful",
            text: `Welcome back, ${userData.firstName || user.email}!`,
            confirmButtonText: "Continue",
          }).then(() => {
            // Check role
            if (userData.role === "Admin") {
              navigate("/admin/menu"); // Admins go to menu
            } else {
              navigate("/admin/dashboard"); // Normal users go to dashboard
            }
          });
        } else {
          // Account is Pending or not verified
          Swal.fire({
            icon: "warning",
            title: "Account Not Verified",
            text: "Your account is still pending verification. Please wait for approval before logging in.",
          });
          await auth.signOut();
        }
      } else {
        Swal.fire({
          icon: "error",
          title: "No Account Found",
          text: "No user record found in the database.",
        });
        await auth.signOut();
      }
    } catch (error) {
      console.error("Login error:", error.message);
      Swal.fire({
        icon: "error",
        title: "Login Failed",
        text: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-box">
        <img
          src="/assets/img/ascelis_logo.png"
          alt="ASCELIS Logo"
          className="login-logo"
        />

        <h1 className="login-title">ASCELIS</h1>
        <p className="login-subtitle">Sign in to continue</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <Link to="/signup">
          <p className="login-subtitle">Don't have an account? Sign up</p>
        </Link>

        <p className="login-footer">© {new Date().getFullYear()} ASCELIS</p>
      </div>
    </div>
  );
}
