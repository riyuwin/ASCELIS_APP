// src/pages/DashboardPage.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/dashboard.css";
import { ref as dbRefRealtime, onValue } from "firebase/database";
import { database, auth, db } from "../../firebase";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import Swal from "sweetalert2";

// Chart imports
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function DashboardPage() {
  const navigate = useNavigate();
  const mapRef = useRef(null);

  const [gpsData, setGpsData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState("realtime");
  const [selectedLog, setSelectedLog] = useState(null);
  const [currentUserName, setCurrentUserName] = useState("");

  const [showUserModal, setShowUserModal] = useState(false);
  const [userDetails, setUserDetails] = useState(null);

  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryData, setSummaryData] = useState([]);
  const [summaryTab, setSummaryTab] = useState("Moving"); // "Moving" or "BPM"

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const today = new Date();
  const formattedToday = today.toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(formattedToday);

  // Fetch current user info
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const docRef = doc(db, "AccountInformation", user.uid);
          const docSnap = await getDoc(docRef);
          setCurrentUserName(docSnap.exists() ? docSnap.data().firstName : "User");
        } catch {
          setCurrentUserName("User");
        }
      } else {
        navigate("/");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
      Swal.fire("Logged Out", "You have been logged out successfully.", "success").then(() =>
        navigate("/")
      );
    } catch (err) {
      Swal.fire("Logout Failed", err.message, "error");
    }
  };

  // User modal
  const handleUserClick = async () => {
    const user = auth.currentUser;
    if (!user) return navigate("/");

    try {
      const docRef = doc(db, "AccountInformation", user.uid);
      const docSnap = await getDoc(docRef);
      setUserDetails(docSnap.exists() ? docSnap.data() : { firstName: "User", email: "N/A" });
      setShowUserModal(true);
    } catch {
      setUserDetails({ firstName: "User", email: "N/A" });
      setShowUserModal(true);
    }
  };

  // Geocoding
  const getLocationName = async (lat, lng) => {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
      );
      const data = await res.json();
      if (data.status === "OK") return data.results[0]?.formatted_address || "Unknown location";
      return "Unknown location";
    } catch {
      return "Unknown location";
    }
  };

  // Load Realtime GPS
  useEffect(() => {
    const realtimeRef = dbRefRealtime(database, "GPS_Details");
    const unsubscribe = onValue(realtimeRef, async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const locationName = await getLocationName(data.Latitude, data.Longitude);
        setGpsData({ ...data, LocationName: locationName });
      }
    });
    return () => unsubscribe();
  }, []);

  // Load Logs
  useEffect(() => {
    const logsRef = dbRefRealtime(database, "GPS_Logs");
    const unsubscribeLogs = onValue(logsRef, async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const logsArray = await Promise.all(
          Object.keys(data).map(async (id) => {
            const log = data[id];
            const locationName = await getLocationName(log.Latitude, log.Longitude);
            return { id, ...log, LocationName: locationName };
          })
        );
        logsArray.sort((a, b) => b.UnixTime - a.UnixTime);
        setLogs(logsArray);
      }
    });
    return () => unsubscribeLogs();
  }, []);

  // Map rendering
  // Map rendering with detailed info for each log marker
  useEffect(() => {
    if (!window.google || !mapRef.current) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 14.5995, lng: 120.9842 },
      zoom: 12,
    });

    // Realtime marker
    if (activeTab === "realtime" && gpsData) {
      const marker = new window.google.maps.Marker({
        position: { lat: gpsData.Latitude, lng: gpsData.Longitude },
        map,
        title: `Realtime: ${gpsData.LocationName}`,
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `<div>
        <p><strong>DateTime:</strong> ${gpsData.DateTime}</p>
        <p><strong>Latitude:</strong> ${gpsData.Latitude}</p>
        <p><strong>Longitude:</strong> ${gpsData.Longitude}</p>
        <p><strong>Location:</strong> ${gpsData.LocationName}</p>
        <p><strong>Moving:</strong> ${gpsData.MotionStatus}</p>
        <p><strong>BPM:</strong> ${gpsData.BPM || "N/A"}</p>
      </div>`,
      });

      marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
      map.setCenter({ lat: gpsData.Latitude, lng: gpsData.Longitude });
      map.setZoom(16);
    }

    // Logs markers
    if (activeTab === "logs" && logs.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();

      logs
        .filter((log) => {
          const [month, day, year] = log.DateTime.split(" ")[0].split("/");
          return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` === selectedDate;
        })
        .forEach((log) => {
          const marker = new window.google.maps.Marker({
            position: { lat: log.Latitude, lng: log.Longitude },
            map,
            title: `Log ID: ${log.id}`,
          });

          const infoWindow = new window.google.maps.InfoWindow({
            content: `<div>
            <p><strong>ID:</strong> ${log.id}</p>
            <p><strong>DateTime:</strong> ${log.DateTime}</p>
            <p><strong>Latitude:</strong> ${log.Latitude}</p>
            <p><strong>Longitude:</strong> ${log.Longitude}</p>
            <p><strong>Location:</strong> ${log.LocationName}</p>
            <p><strong>Moving:</strong> ${log.MotionStatus}</p>
            <p><strong>BPM:</strong> ${log.BPM || "N/A"}</p>
          </div>`,
          });

          marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
          bounds.extend({ lat: log.Latitude, lng: log.Longitude });
        });

      map.fitBounds(bounds);
    }
  }, [gpsData, logs, activeTab, selectedLog, selectedDate]);


  // Summary modal for whole day
  const openSummaryModalForDay = () => {
    const selectedDayLogs = logs.filter((l) => {
      const [month, day, year] = l.DateTime.split(" ")[0].split("/");
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` === selectedDate;
    });

    if (!selectedDayLogs.length) {
      Swal.fire("No records", "No logs found for the selected day.", "info");
      return;
    }

    const chartData = Array.from({ length: 24 }, (_, i) => {
      const hourRecords = selectedDayLogs.filter((r) => parseInt(r.DateTime.split(" ")[1].split(":")[0], 10) === i);
      return {
        hour: i,
        Moving: hourRecords.reduce((acc, r) => acc + (r.MotionStatus ? 1 : 0), 0),
        BPM: hourRecords.length ? hourRecords.reduce((acc, r) => acc + (r.BPM || 0), 0) / hourRecords.length : 0,
      };
    });

    setSummaryData(chartData);
    setSummaryTab("Moving");
    setShowSummaryModal(true);
  };

  const LineChart = ({ data, tab }) => {
  const labels = data.map((d) => `${d.hour}:00`);
  const dataset = data.map((d) => d[tab]);

  const chartData = {
    labels,
    datasets: [
      {
        label: tab,
        data: dataset,
        borderColor: tab === "Moving" ? "#0015FF" : "#28a745",
        backgroundColor: tab === "Moving" ? "#0015FF55" : "#28a74555",
        tension: 0,       // ✅ STRAIGHT LINE
        fill: true,
        pointRadius: 4,   // optional: dots sa bawat point
        pointHoverRadius: 6,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
  };

  return <Line data={chartData} options={options} />;
};



  return (
    <div className="dashboard-wrapper">
      {/* LEFT PANEL */}
      <div className="left-panel">
        <div className="logout-container">
          <span className="user-name" onClick={handleUserClick}>
            Hello, {currentUserName || "User"}
          </span>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>

        <img src="/assets/img/ascelis_logo.png" alt="ASCELIS Logo" className="left-logo" />
        <h1>ASCELIS</h1>

        {/* Tabs */}
        <div className="tab-buttons">
          <button className={activeTab === "realtime" ? "active" : ""} onClick={() => { setActiveTab("realtime"); setSelectedLog(null); }}>Realtime</button>
          <button className={activeTab === "logs" ? "active" : ""} onClick={() => { setActiveTab("logs"); setSelectedLog(null); }}>Logs</button>
        </div>

        {/* Logs Controls */}
        {activeTab === "logs" && (
          <div className="logs-controls">
            <button className="summary-btn-large" onClick={openSummaryModalForDay}>
              Summary {/* for {selectedDate} */}
            </button>
            <div className="date-filter">
              <label htmlFor="filter-date"><strong>Select Date:</strong></label>
              <input type="date" id="filter-date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              <button onClick={() => setSelectedDate(formattedToday)}>Today</button>
            </div>
          </div>
        )}

        {/* Details */}
        <div className="details">
          {activeTab === "realtime" ? (
            gpsData ? (
              <>
                <p><strong>Accuracy:</strong> {gpsData.Accuracy}</p>
                <p><strong>DateTime:</strong> {gpsData.DateTime}</p>
                <p><strong>Latitude:</strong> {gpsData.Latitude}</p>
                <p><strong>Longitude:</strong> {gpsData.Longitude}</p>
                <p><strong>UnixTime:</strong> {gpsData.UnixTime}</p>
                <p><strong>Location Name:</strong> {gpsData.LocationName}</p>
                <p><strong>Moving:</strong> {gpsData.MotionStatus}</p>
                <p><strong>BPM:</strong> {gpsData.BPM || "N/A"}</p>
              </>
            ) : <p>Loading Realtime data...</p>
          ) : (
            logs.length > 0 ? (
              <div className="logs-list">
                {logs.filter((log) => {
                  const [month, day, year] = log.DateTime.split(" ")[0].split("/");
                  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` === selectedDate;
                }).map((log) => (
                  <div key={log.id} className={`log-entry ${selectedLog?.id === log.id ? "selected" : ""}`} onClick={() => setSelectedLog(log)}>
                    <p><strong>ID:</strong> {log.id}</p>
                    <p><strong>DateTime:</strong> {log.DateTime}</p>
                    <p><strong>Moving:</strong> {gpsData.MotionStatus}</p>
                    <p><strong>BPM:</strong> {gpsData.BPM || "N/A"}</p>
                    <p><strong>Latitude:</strong> {log.Latitude}</p>
                    <p><strong>Longitude:</strong> {log.Longitude}</p>
                    <p><strong>Location Name:</strong> {log.LocationName}</p>
                  </div>
                ))}
              </div>
            ) : <p>Loading logs...</p>
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="right-panel">
        <div id="map" ref={mapRef}></div>
      </div>

      {/* USER MODAL */}
      {showUserModal && (
        <div className="modal-overlay" onClick={() => setShowUserModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Profile:</h2>
            <p><strong>Name:</strong> {userDetails?.firstName} {userDetails?.middleName} {userDetails?.lastName}</p>
            <p><strong>Gender:</strong> {userDetails?.gender || "N/A"}</p>
            <p><strong>Email:</strong> {userDetails?.email || "N/A"}</p>
            <p><strong>Contact Number:</strong> {userDetails?.contact || "N/A"}</p>
            <p><strong>Birthdate:</strong> {userDetails?.bdate || "N/A"}</p>
          </div>
        </div>
      )}

      {/* SUMMARY MODAL */}
      {showSummaryModal && (
        <div className="modal-overlay" onClick={() => setShowSummaryModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h2>Summary for {selectedDate}</h2>
            <div className="summary-tabs">
              <button className={summaryTab === "Moving" ? "active" : ""} onClick={() => setSummaryTab("Moving")}>Moving</button>
              <button className={summaryTab === "BPM" ? "active" : ""} onClick={() => setSummaryTab("BPM")}>BPM</button>
            </div>
            {summaryData.length > 0 && <div className="chart-container"><LineChart data={summaryData} tab={summaryTab} /></div>}
            <button className="closeModalBtn" onClick={() => setShowSummaryModal(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
