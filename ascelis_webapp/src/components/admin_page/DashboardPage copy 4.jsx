// src/pages/DashboardPage.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/dashboard.css";
import { ref as dbRefRealtime, onValue, remove } from "firebase/database";
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

// Leaflet imports
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet marker URLs
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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
  const [summaryTab, setSummaryTab] = useState("Moving");

  const today = new Date();
  const formattedToday = today.toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(formattedToday);

  const [showLogModal, setShowLogModal] = useState(false);

  const locationCache = useRef({});

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

  // Geocoding with cache
  const getLocationName = async (lat, lng) => {
    const key = `${lat},${lng}`;
    if (locationCache.current[key]) return locationCache.current[key];

    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // throttle
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&email=example@example.com`);
      if (!res.ok) return `${lat}, ${lng}`;
      const data = await res.json();
      const name = data.display_name ||
        (data.address ? [
          data.address.village,
          data.address.town,
          data.address.city,
          data.address.county,
          data.address.state,
          data.address.country
        ].filter(Boolean).join(", ") : `${lat}, ${lng}`);
      locationCache.current[key] = name;
      return name;
    } catch {
      return `${lat}, ${lng}`;
    }
  };

  // Realtime GPS
  useEffect(() => {
    const realtimeRef = dbRefRealtime(database, "SensorData");
    const unsubscribe = onValue(realtimeRef, async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const normalizedData = {
          DateTime: data.DateTime,
          accelX: data.accelX,
          velocityX: data.velocityX,
          distanceX_cm: data.distanceX_cm,
          heartRate: data.heartRate,
          spO2: data.spO2,
          latitude: data.latitude,
          longitude: data.longitude,
          MotionStatus: data.accelX === 0 && data.velocityX === 0 ? false : true,
          BPM: data.heartRate,
        };
        const locationName = await getLocationName(normalizedData.latitude, normalizedData.longitude);
        setGpsData({ ...normalizedData, LocationName: locationName });
      }
    });
    return () => unsubscribe();
  }, []);

  // Logs
  useEffect(() => {
    const logsRef = dbRefRealtime(database, "SensorDataLogs");
    const unsubscribeLogs = onValue(logsRef, async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const logsArray = [];
        for (const id of Object.keys(data)) {
          const log = data[id];
          await new Promise(resolve => setTimeout(resolve, 300));
          const locationName = await getLocationName(log.latitude, log.longitude);
          logsArray.push({ id, ...log, LocationName: locationName });
        }
        logsArray.sort((a, b) => new Date(b.DateTime) - new Date(a.DateTime));
        setLogs(logsArray);
      }
    });
    return () => unsubscribeLogs();
  }, []);

  // Map
  useEffect(() => {
    if (!mapRef.current) return;

    const defaultCoords = [14.1129, 122.9553];
    const initialZoom = activeTab === "logs" ? 13 : 16;

    const map = L.map(mapRef.current).setView(defaultCoords, initialZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 20,
    }).addTo(map);

    // Realtime marker
    if (activeTab === "realtime" && gpsData && gpsData.latitude != null && gpsData.longitude != null) {
      L.marker([gpsData.latitude, gpsData.longitude]).addTo(map)
        .bindPopup(`<div>
          <p><strong>BPM:</strong> ${gpsData.BPM || "0"}</p>
          <p><strong>SpO2:</strong> ${gpsData.spO2 || "0"}%</p>
          <p><strong>Acceleration:</strong> ${gpsData.accelX || "0"} m/s</p>
          <p><strong>Velocitty:</strong> ${gpsData.velocityX || "0"} m/s</p>
          <p><strong>Moving:</strong> ${gpsData.MotionStatus}</p>
          <p><strong>Latitude:</strong> ${gpsData.latitude}</p>
          <p><strong>Longitude:</strong> ${gpsData.longitude}</p>
          <p><strong>Location:</strong> ${gpsData.LocationName}</p>
          <p><strong>DateTime:</strong> ${gpsData.DateTime}</p>
        </div>`);
      map.setView([gpsData.latitude, gpsData.longitude], 16);
    }

    // Logs markers
    if (activeTab === "logs" && logs.length > 0) {
      logs.filter(log => {
        const logDate = new Date(log.DateTime);
        const year = logDate.getFullYear();
        const month = String(logDate.getMonth() + 1).padStart(2, "0");
        const day = String(logDate.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}` === selectedDate;
      }).forEach(log => {
        if (log.latitude != null && log.longitude != null) {
          L.marker([log.latitude, log.longitude]).addTo(map)
            .bindPopup(`<div>
              <p><strong>ID:</strong> ${log.id}</p>
              <p><strong>BPM:</strong> ${log.heartRate || "0"}</p>
              <p><strong>SpO2:</strong> ${log.spO2}</p>
              <p><strong>Acceleration:</strong> ${gpsData.accelX || "0"} m/s</p>
              <p><strong>Velocitty:</strong> ${gpsData.velocityX || "0"} m/s</p>
              <p><strong>Moving:</strong> ${log.MotionStatus}</p>
              <p><strong>Latitude:</strong> ${log.latitude}</p>
              <p><strong>Longitude:</strong> ${log.longitude}</p>
              <p><strong>Location:</strong> ${log.LocationName}</p>
              <p><strong>DateTime:</strong> ${log.DateTime}</p>
            </div>`);
        }
      });
    }

    return () => map.remove();
  }, [gpsData, logs, activeTab, selectedDate]);

  // SUMMARY MODAL
  const openSummaryModalForDay = () => {
    const selectedDayLogs = logs.filter(l => {
      const logDate = new Date(l.DateTime);
      const year = logDate.getFullYear();
      const month = String(logDate.getMonth() + 1).padStart(2, "0");
      const day = String(logDate.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}` === selectedDate;
    });

    if (!selectedDayLogs.length) {
      Swal.fire("No records", "No logs found for the selected day.", "info");
      return;
    }

    const chartData = Array.from({ length: 24 }, (_, hour) => {
      const hourRecords = selectedDayLogs.filter(r => {
        const recordHour = new Date(r.DateTime).getHours();
        return recordHour === hour;
      });

      const avgBPM = hourRecords.length
        ? hourRecords.reduce((acc, r) => acc + (r.heartRate || 0), 0) / hourRecords.length
        : 0;

      const avgSpO2 = hourRecords.length
        ? hourRecords.reduce((acc, r) => acc + (r.spO2 || 0), 0) / hourRecords.length
        : 0;

      // MovingStatus → 1 if Moving, 0 if Not Moving
      const movingValue = hourRecords.length
        ? hourRecords.some(r => r.MovingStatus === "Moving") ? 1 : 0
        : 0;

      return {
        hour,
        BPM: avgBPM,
        SpO2: avgSpO2,
        Moving: movingValue
      };
    });

    setSummaryData(chartData);
    setSummaryTab("BPM");
    setShowSummaryModal(true);
  };

  const LineChart = ({ data, tab }) => {
    const labels = data.map(d => `${d.hour}:00`);
    const dataset = data.map(d => d[tab]);

    const chartColors = {
      BPM: "#28a745",
      SpO2: "#FF8800",
      Moving: "#007bff"
    };

    const chartData = {
      labels,
      datasets: [
        {
          label: tab,
          data: dataset,
          borderColor: chartColors[tab],
          backgroundColor: chartColors[tab] + "55",
          tension: 0.3,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: tab === "Moving"
          ? {
            min: 0,
            max: 1,
            ticks: {
              callback: function (value) {
                return value === 1 ? "Moving" : "Not Moving";
              }
            }
          }
          : {}
      }
    };

    return <Line data={chartData} options={options} />;
  };

  const handleLogClick = log => {
    setSelectedLog(log);
    setShowLogModal(true);
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

        <div className="tab-buttons">
          <button className={activeTab === "realtime" ? "active" : ""} onClick={() => { setActiveTab("realtime"); setSelectedLog(null); }}>Realtime</button>
          <button className={activeTab === "logs" ? "active" : ""} onClick={() => { setActiveTab("logs"); setSelectedLog(null); }}>Logs</button>
        </div>

        {activeTab === "logs" && (
          <div className="logs-controls">
            <button className="summary-btn-large" onClick={openSummaryModalForDay}>Summary</button>
            <div className="date-filter">
              <label htmlFor="filter-date"><strong>Select Date:</strong></label>
              <input type="date" id="filter-date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
              <button onClick={() => setSelectedDate(formattedToday)}>Today</button>
            </div>
          </div>
        )}

        <div className="details">
          {activeTab === "realtime" ? (
            gpsData ? (
              <>
                <p><strong>BPM:</strong> {gpsData.BPM || "0"}</p>
                <p><strong>SpO2:</strong> {gpsData.spO2 || "0"} %</p>
                <p>
                  <strong>Acceleration:</strong>{" "}
                  {gpsData.accelX !== undefined
                    ? Math.max(0, gpsData.accelX).toFixed(2)
                    : "N/A"} m/s²
                </p>

                <p>
                  <strong>Velocity:</strong>{" "}
                  {gpsData.velocityX !== undefined
                    ? Math.max(0, gpsData.velocityX).toFixed(2)
                    : "N/A"} m/s
                </p>
                <p><strong>Moving:</strong> {gpsData.MotionStatus ? "Moving" : "Not moving"}</p>
                <p><strong>Latitude:</strong> {gpsData.latitude}</p>
                <p><strong>Longitude:</strong> {gpsData.longitude}</p>
                <p><strong>Location Name:</strong> {gpsData.LocationName}</p>
                <p><strong>DateTime:</strong> {gpsData.DateTime}</p>
              </>
            ) : <p>Loading Realtime data...</p>
          ) : (
            logs.length > 0 ? (
              <div className="logs-list">
                {logs.filter(log => {
                  const logDate = new Date(log.DateTime);
                  const year = logDate.getFullYear();
                  const month = String(logDate.getMonth() + 1).padStart(2, "0");
                  const day = String(logDate.getDate()).padStart(2, "0");
                  return `${year}-${month}-${day}` === selectedDate;
                }).map(log => (
                  <div key={log.id} className={`log-entry ${selectedLog?.id === log.id ? "selected" : ""}`} onClick={() => handleLogClick(log)}>
                    <p><strong>ID:</strong> {log.id}</p>
                    <p><strong>DateTime:</strong> {log.DateTime}</p>
                    <p><strong>Latitude:</strong> {log.latitude}</p>
                    <p><strong>Longitude:</strong> {log.longitude}</p>
                    <p><strong>Location Name:</strong> {log.LocationName}</p>
                  </div>
                ))}
              </div>
            ) : <p>Loading logs...</p>
          )}
        </div>
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

      {showSummaryModal && (
        <div className="modal-overlay" onClick={() => setShowSummaryModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h2>Summary for {selectedDate}</h2>
            <div className="summary-tabs">
              <button className={summaryTab === "Moving" ? "active" : ""} onClick={() => setSummaryTab("Moving")}>Moving</button>
              <button className={summaryTab === "BPM" ? "active" : ""} onClick={() => setSummaryTab("BPM")}>BPM</button>
              <button className={summaryTab === "SpO2" ? "active" : ""} onClick={() => setSummaryTab("SpO2")}>SpO2</button>
            </div>
            {summaryData.length > 0 && <div className="chart-container"><LineChart data={summaryData} tab={summaryTab} /></div>}
            <button className="closeModalBtn" onClick={() => setShowSummaryModal(false)}>Close</button>
          </div>
        </div>
      )}
      {/* LOG RECORD MODAL */}
      {showLogModal && selectedLog && (
        <div className="modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {/* LOGO */}
            <div className="modalLogoWrapper">
              <img src="/assets/img/ascelis_logo.png" alt="Logo" className="modalLogo" />
            </div><br />

            <h2>Log Record: {selectedLog.id}</h2>
            <p><strong>BPM:</strong> {selectedLog.BPM || "0"}</p>
            <p><strong>SpO2:</strong> {selectedLog.spO2 || "0"} %</p>
            <p>
              <strong>Acceleration:</strong>{" "}
              {gpsData.accelX !== undefined
                ? Math.max(0, gpsData.accelX).toFixed(2)
                : "N/A"} m/s²
            </p>

            <p>
              <strong>Velocity:</strong>{" "}
              {gpsData.velocityX !== undefined
                ? Math.max(0, gpsData.velocityX).toFixed(2)
                : "N/A"} m/s
            </p>
            <p><strong>Moving:</strong> {selectedLog.MotionStatus ? "Moving" : "Not moving"}</p>
            <p><strong>Latitude:</strong> {selectedLog.latitude}</p>
            <p><strong>Longitude:</strong> {selectedLog.longitude}</p>
            <p><strong>Location Name:</strong> {selectedLog.LocationName}</p>
            <p><strong>DateTime:</strong> {selectedLog.DateTime}</p>

            <div className="modalButtonRow">



              <button
                className="deleteBtn"
                onClick={async () => {
                  const confirm = await Swal.fire({
                    title: "Delete Record?",
                    text: "This action cannot be undone.",
                    icon: "warning",
                    showCancelButton: true,
                    confirmButtonText: "Delete",
                    cancelButtonText: "Cancel",
                  });

                  if (confirm.isConfirmed) {
                    try {
                      const recordRef = dbRefRealtime(
                        database,
                        `SensorDataLogs/${selectedLog.id}`
                      );

                      await remove(recordRef);

                      Swal.fire("Deleted!", "The record has been deleted.", "success");
                      setShowLogModal(false);
                    } catch (err) {
                      Swal.fire("Error", err.message, "error");
                    }
                  }
                }}
              >
                Delete Record
              </button>

              <button
                className="closeModalBtn"
                onClick={() => setShowLogModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* RIGHT PANEL */}
      <div className="right-panel">
        <div id="map" ref={mapRef}></div>
      </div>
    </div>
  );
}