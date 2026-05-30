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

  // Cache for geocoding results to avoid repeated requests
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

  // Throttled geocoding with cache
  const getLocationName = async (lat, lng) => {
    const key = `${lat},${lng}`;
    if (locationCache.current[key]) return locationCache.current[key];

    try {
      // Throttle requests to 1 per second
      await new Promise(resolve => setTimeout(resolve, 1000));

      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&email=example@example.com`);
      if (!res.ok) return `Fetching location name...`/* `${lat}, ${lng}` */;
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

  // Load Logs with staggered requests
  useEffect(() => {
    const logsRef = dbRefRealtime(database, "GPS_Logs");
    const unsubscribeLogs = onValue(logsRef, async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const logsArray = [];
        for (const [index, id] of Object.keys(data).entries()) {
          const log = data[id];
          await new Promise(resolve => setTimeout(resolve, 500)); // 0.5s delay between requests
          const locationName = await getLocationName(log.Latitude, log.Longitude);
          logsArray.push({ id, ...log, LocationName: locationName });
        }
        logsArray.sort((a, b) => b.UnixTime - a.UnixTime);
        setLogs(logsArray);
      }
    });
    return () => unsubscribeLogs();
  }, []);

  // Map rendering
  useEffect(() => {
    if (!mapRef.current) return;

    // Default coords: Camarines Norte (Daet)
    const defaultCoords = [14.1129, 122.9553];

    // Tab-based zoom
    const initialZoom = activeTab === "logs" ? 13 : 16;

    const map = L.map(mapRef.current).setView(defaultCoords, initialZoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 20,
    }).addTo(map);

    // Realtime tab: follow live GPS
    if (activeTab === "realtime" && gpsData) {
      const marker = L.marker([gpsData.Latitude, gpsData.Longitude]).addTo(map)
        .bindPopup(`<div>
        <p><strong>DateTime:</strong> ${gpsData.DateTime}</p>
        <p><strong>Latitude:</strong> ${gpsData.Latitude}</p>
        <p><strong>Longitude:</strong> ${gpsData.Longitude}</p>
        <p><strong>Location:</strong> ${gpsData.LocationName}</p>
        <p><strong>Moving:</strong> ${gpsData.MotionStatus}</p>
        <p><strong>BPM:</strong> ${gpsData.BPM || "N/A"}</p>
      </div>`);
      map.setView([gpsData.Latitude, gpsData.Longitude], 16); // center map on live location
    }

    // Logs tab: fixed Camarines Norte, zoom 10
    if (activeTab === "logs" && logs.length > 0) {
      logs.filter((log) => {
        const [month, day, year] = log.DateTime.split(" ")[0].split("/");
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` === selectedDate;
      }).forEach((log) => {
        L.marker([log.Latitude, log.Longitude]).addTo(map)
          .bindPopup(`<div>
          <p><strong>ID:</strong> ${log.id}</p>
          <p><strong>DateTime:</strong> ${log.DateTime}</p>
          <p><strong>Latitude:</strong> ${log.Latitude}</p>
          <p><strong>Longitude:</strong> ${log.Longitude}</p>
          <p><strong>Location:</strong> ${log.LocationName}</p>
          <p><strong>Moving:</strong> ${log.MotionStatus}</p>
          <p><strong>BPM:</strong> ${log.BPM || "N/A"}</p>
        </div>`);
      });
    }

    return () => map.remove();
  }, [gpsData, logs, activeTab, selectedLog, selectedDate]);

  // Summary modal
  const openSummaryModalForDay = () => {
    const selectedDayLogs = logs.filter((l) => {
      if (!l.DateTime) return false;

      const datePart = l.DateTime.split(" ")[0];
      if (!datePart) return false;

      const parts = datePart.split("/");
      if (parts.length !== 3) return false;

      const [month, day, year] = parts;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` === selectedDate;
    });

    if (!selectedDayLogs.length) {
      Swal.fire("No records", "No logs found for the selected day.", "info");
      return;
    }

    const chartData = Array.from({ length: 24 }, (_, i) => {
      const hourRecords = selectedDayLogs.filter((r) => {
        if (!r.DateTime) return false;
        const timePart = r.DateTime.split(" ")[1];
        if (!timePart) return false;

        const hour = parseInt(timePart.split(":")[0], 10);
        return hour === i;
      });

      return {
        hour: i,
        BPM:
          hourRecords.length > 0
            ? hourRecords.reduce((acc, r) => acc + (parseFloat(r.BPM) || 0), 0) /
            hourRecords.length
            : 0,
        SpO2:
          hourRecords.length > 0
            ? hourRecords.reduce((acc, r) => acc + (parseFloat(r.SpO2) || 0), 0) /
            hourRecords.length
            : 0,
      };
    });

    setSummaryData(chartData);
    setSummaryTab("BPM");
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
          borderColor: tab === "BPM" ? "#28a745" : "#FF8800",
          backgroundColor: tab === "BPM" ? "#28a74555" : "#FF880055",
          tension: 0.3,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    };

    return (
      <Line
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true },
          },
          scales: {
            y: {
              beginAtZero: true,
            },
          },
        }}
      />
    );
  };

  const handleLogClick = (log) => {
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
            <button className="summary-btn-large" onClick={openSummaryModalForDay}>
              Summary
            </button>
            <div className="date-filter">
              <label htmlFor="filter-date"><strong>Select Date:</strong></label>
              <input type="date" id="filter-date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              <button onClick={() => setSelectedDate(formattedToday)}>Today</button>
            </div>
          </div>
        )}

        <div className="details">
          {activeTab === "realtime" ? (
            gpsData ? (
              <>
                <p><strong>Accuracy:</strong> {gpsData.Accuracy}</p>
                <p><strong>DateTime:</strong> {gpsData.DateTime}</p>
                <p><strong>Latitude:</strong> {gpsData.Latitude}</p>
                <p><strong>Longitude:</strong> {gpsData.Longitude}</p>
                <p><strong>Location Name:</strong> {gpsData.LocationName}</p>
                <p><strong>Moving Distance:</strong> {gpsData.DistanceCm}</p>
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
                  <div key={log.id} className={`log-entry ${selectedLog?.id === log.id ? "selected" : ""}`} onClick={() => handleLogClick(log)}>
                    <p><strong>ID:</strong> {log.id}</p>
                    <p><strong>DateTime:</strong> {log.DateTime}</p>
                    {/* <p><strong>Moving Distance:</strong> {log.DistanceTravelled}</p>
                    <p><strong>Moving:</strong> {log.MotionStatus}</p>
                    <p><strong>BPM:</strong> {log.BPM || "N/A"}</p> */}
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

      {/* LOG RECORD MODAL */}
      {showLogModal && selectedLog && (
        <div className="modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {/* LOGO */}
            <div className="modalLogoWrapper">
              <img src="/assets/img/ascelis_logo.png" alt="Logo" className="modalLogo" />
            </div><br />

            <h2>Log Record: {selectedLog.id}</h2>
            <p><strong>DateTime:</strong> {selectedLog.DateTime}</p>
            <p><strong>Latitude:</strong> {selectedLog.Latitude}</p>
            <p><strong>Longitude:</strong> {selectedLog.Longitude}</p>
            <p><strong>Location Name:</strong> {selectedLog.LocationName}</p>
            <p><strong>Moving Distance:</strong> {selectedLog.DistanceCm}</p>
            <p><strong>Moving:</strong> {selectedLog.MotionStatus}</p>
            <p><strong>BPM:</strong> {selectedLog.BPM || "N/A"}</p>

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
                      const recordRef = dbRefRealtime(database, `GPS_Logs/${selectedLog.id}`);
                      await recordRef.remove();
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

    </div>
  );
}