import React, { useState, useEffect } from "react";
import "../../css/signup.css";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";

// Firebase imports  
import { auth, db } from "../../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

export default function Signup() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  // Step 1: Basic Info
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [extName, setExtName] = useState("");
  const [gender, setGender] = useState("");
  const [bdate, setBdate] = useState("");
  const [contact, setContact] = useState("");

  // Step 2: Account Info
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Step 3: Account Status (default pending)
  const accountStatus = "Pending";
  const role = "Member";

  // Check if Step 1 is valid
  const isStep1Valid = firstName && lastName && gender && bdate && contact;

  // Check if Step 2 is valid
  const isStep2Valid =
    email && password && confirmPassword && password === confirmPassword;

  const handleNextStep = (e) => {
    e.preventDefault();
    if (step === 1 && !isStep1Valid) {
      Swal.fire({
        icon: "warning",
        title: "Incomplete Fields",
        text: "Please fill all required fields before proceeding.",
      });
      return;
    }
    setStep(step + 1);
  };

  const handlePrevStep = (e) => {
    e.preventDefault();
    setStep(step - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isStep2Valid) {
      Swal.fire({
        icon: "error",
        title: "Invalid Input",
        text: "Please make sure all fields are filled and passwords match.",
      });
      return;
    }

    try {
      // 1️⃣ Create user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const userId = userCredential.user.uid;

      // 2️⃣ Save other account info in Firestore
      await setDoc(doc(db, "AccountInformation", userId), {
        firstName,
        middleName,
        lastName,
        extName,
        gender,
        bdate,
        contact,
        email,
        accountStatus,
        role,
        createdAt: new Date().toISOString(),
      });

      // 3️⃣ Success popup
      await Swal.fire({
        icon: "success",
        title: "Account Created!",
        text: "Your account has been submitted successfully. Please wait for admin verification.",
        confirmButtonText: "OK",
      });

      setStep(3); // move to step 3 notice
    } catch (error) {
      console.error("Signup error:", error.message);

      Swal.fire({
        icon: "error",
        title: "Signup Failed",
        text: error.message,
      });
    }
  };

  return (
    <div className="signup-wrapper">
      <div className="signup-box">
        <img
          src="/assets/img/ascelis_logo.png"
          alt="ASCELIS Logo"
          className="signup-logo"
        />

        <h1 className="signup-title">ASCELIS</h1>
        <p className="signup-subtitle">Create your account</p>

        <form onSubmit={handleSubmit}>
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <>
              <h2 className="step-title">Step 1: Basic Info</h2>

              <div className="form-group">
                <label>First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Middle Name</label>
                <input
                  type="text"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Extension Name</label>
                <input
                  type="text"
                  value={extName}
                  onChange={(e) => setExtName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  required
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>Birthdate</label>
                <input
                  type="date"
                  value={bdate}
                  onChange={(e) => setBdate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Contact Number</label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  required
                />
              </div>

              <div className="form-controls">
                <button
                  onClick={handleNextStep}
                  className="signup-btn"
                  disabled={!isStep1Valid}
                >
                  Next
                </button>
              </div>
            </>
          )}

          {/* Step 2: Account Info */}
          {step === 2 && (
            <>
              <h2 className="step-title">Step 2: Account Info</h2>

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

              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <div className="form-controls">
                <button onClick={handlePrevStep} className="signup-btn prev-btn">
                  Previous
                </button>
                <button
                  type="submit"
                  className="signup-btn"
                  disabled={!isStep2Valid}
                >
                  Submit
                </button>
              </div>
            </>
          )}

          {/* Step 3: Notice */}
          {step === 3 && (
            <div className="notice-step">
              <h2 className="step-title">Account Pending Verification</h2>
              <p>
                Your account has been submitted successfully. Please wait for
                an admin to verify and approve your account.
              </p>
              <button className="signup-btn" onClick={() => navigate("/")}>
                Back to Login
              </button>
            </div>
          )}
        </form>

        <p className="signup-footer">
          Already have an account? <Link to="/">Login here</Link>
        </p>

        <p className="signup-footer">© {new Date().getFullYear()} ASCELIS</p>
      </div>
    </div>
  );
}
