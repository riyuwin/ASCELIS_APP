import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/dashboard.css";
import { ref as dbRefRealtime, onValue } from "firebase/database";
import { database, auth, db } from "../../firebase";
import { signOut } from "firebase/auth";
import Swal from "sweetalert2";
import { ref as dbRef, remove, update } from "firebase/database";
import { FaSave, FaTrash, FaTimes } from "react-icons/fa";
import {
  collection,
  addDoc,
  updateDoc,
  serverTimestamp,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  onSnapshot
} from "firebase/firestore";

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
  const mapInstanceRef = useRef(null);
  const realtimeMarkerRef = useRef(null);
  const logMarkersRef = useRef([]);

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
  const [rescueMarkers, setRescueMarkers] = useState({}); // key: uid, value: marker
  const pathPolylineRef = useRef(null);
  const pathCoordinatesRef = useRef([]); // stores LatLng points

  const [showLogModal, setShowLogModal] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [isTrackingRescue, setIsTrackingRescue] = useState(false);
  const [rescuerMarker, setRescuerMarker] = useState(null);
  const [watchId, setWatchId] = useState(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const today = new Date();
  const formattedToday = today.toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(formattedToday);

  const currentUserMarkerRef = useRef(null);   // holds the current rescuer marker 
  // Fetch current user info
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const docRef = doc(db, "AccountInformation", user.uid);
          const docSnap = await getDoc(docRef);
          setCurrentUserName(docSnap.exists() ? docSnap.data().firstName + " " + docSnap.data().lastName : "User");
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

  // ------------------------- Google Maps Helpers -------------------------
  // Keep only one
  function deg2rad(deg) { return deg * (Math.PI / 180); }
  function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

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

  // ------------------------- Fetch Previous Path -------------------------
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const fetchPreviousPath = async () => {
      if (!auth.currentUser) return;
      try {
        const logsQuery = query(
          collection(db, "GPS_Logs"),
          where("uid", "==", auth.currentUser.uid)
        );
        const snapshot = await getDocs(logsQuery);
        if (!snapshot.empty) {
          const coords = snapshot.docs
            .map(doc => doc.data())
            .sort((a, b) => a.UnixTime - b.UnixTime)
            .map(d => ({ lat: d.Latitude, lng: d.Longitude }));

          pathCoordinatesRef.current = coords;

          if (coords.length > 1) {
            // Use Directions API to follow roads
            const directionsService = new window.google.maps.DirectionsService();

            // Split into segments of two points each to avoid API limits
            let fullPath = [];
            for (let i = 0; i < coords.length - 1; i++) {
              const start = coords[i];
              const end = coords[i + 1];

              await new Promise((resolve) => {
                directionsService.route(
                  {
                    origin: start,
                    destination: end,
                    travelMode: window.google.maps.TravelMode.WALKING, // Or DRIVING
                  },
                  (result, status) => {
                    if (status === "OK" && result.routes.length > 0) {
                      fullPath.push(...result.routes[0].overview_path);
                    } else {
                      // Fallback to straight line if failed
                      fullPath.push(start, end);
                    }
                    resolve();
                  }
                );
              });
            }

            pathCoordinatesRef.current = fullPath;

            pathPolylineRef.current = new window.google.maps.Polyline({
              path: pathCoordinatesRef.current,
              geodesic: true,
              strokeColor: "#FF0000",
              strokeOpacity: 1.0,
              strokeWeight: 4,
              map,
            });

            // Center map on last coordinate
            map.panTo(pathCoordinatesRef.current[pathCoordinatesRef.current.length - 1]);
          }
        }
      } catch (err) {
        console.error("Error fetching previous path:", err);
      }
    };

    fetchPreviousPath();
  }, [mapInstanceRef.current]);

  // ------------------------- Realtime GPS -------------------------
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

  // ------------------------- Logs -------------------------
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

  // ------------------------- Map Initialization -------------------------
  useEffect(() => {
    if (!window.google || !mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 14.5995, lng: 120.9842 },
        zoom: 16,
      });
    }
  }, []);

  // ------------------------- Update Markers -------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear previous markers
    if (realtimeMarkerRef.current) {
      realtimeMarkerRef.current.setMap(null);
      realtimeMarkerRef.current = null;
    }
    logMarkersRef.current.forEach((m) => m.setMap(null));
    logMarkersRef.current = [];

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
      realtimeMarkerRef.current = marker;

      map.panTo({ lat: gpsData.Latitude, lng: gpsData.Longitude });

      if (rescuerMarker) {
        rescuerMarker.setMap(map);
        map.panTo(rescuerMarker.getPosition());
      }
    }

    if (activeTab === "logs") {
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
          logMarkersRef.current.push(marker);
        });
    }
  }, [gpsData, logs, activeTab, selectedDate, rescuerMarker]);

  // ------------------------- Rescues Markers -------------------------
  const rescuerMarkersRef = useRef({}); // key: uid, value: marker

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const rescuesRef = collection(db, "Rescues");

    const unsubscribe = onSnapshot(rescuesRef, (snapshot) => {
      const freshUids = {};

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const uid = data.uid;
        freshUids[uid] = true;
        const position = { lat: data.latitude, lng: data.longitude };

        if (rescuerMarkersRef.current[uid]) {
          // Update existing marker
          const marker = rescuerMarkersRef.current[uid];
          marker.setPosition(position);

          const infoWindow = marker.infoWindow;
          if (infoWindow) {
            infoWindow.setContent(`
            <div>
              <p><strong>Name:</strong> ${data.name}</p>
              <p><strong>Location:</strong> ${data.locationName}</p>
              <p><strong>Latitude:</strong> ${data.latitude}</p>
              <p><strong>Longitude:</strong> ${data.longitude}</p>
              <p><strong>Timestamp:</strong> ${data.timestamp?.toDate?.()?.toLocaleString() || "N/A"}</p>
            </div>
          `);
          }
        } else {
          // Create new marker
          const marker = new window.google.maps.Marker({
            position,
            map,
            title: `Rescuer: ${data.name}`,
            icon: {
              url: "/assets/img/ascelis_logo.png",
              scaledSize: new window.google.maps.Size(40, 40),
            },
          });

          const infoWindow = new window.google.maps.InfoWindow({
            content: `
            <div>
              <p><strong>Name:</strong> ${data.name}</p>
              <p><strong>Location:</strong> ${data.locationName}</p>
              <p><strong>Latitude:</strong> ${data.latitude}</p>
              <p><strong>Longitude:</strong> ${data.longitude}</p>
              <p><strong>Timestamp:</strong> ${data.timestamp?.toDate?.()?.toLocaleString() || "N/A"}</p>
            </div>
          `,
          });

          marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
          marker.infoWindow = infoWindow;

          rescuerMarkersRef.current[uid] = marker;
        }
      });

      // Remove markers no longer in Firestore
      Object.keys(rescuerMarkersRef.current).forEach((uid) => {
        if (!freshUids[uid]) {
          rescuerMarkersRef.current[uid].setMap(null);
          delete rescuerMarkersRef.current[uid];
        }
      });
    });

    return () => unsubscribe();
  }, []);

  // ------------------------- Track Me / Start Rescue -------------------------
  const handleToggleRescue = async () => {
    if (!auth.currentUser) return;
    const map = mapInstanceRef.current;
    if (!navigator.geolocation) {
      Swal.fire("Error", "Geolocation not supported.", "error");
      return;
    }

    // STOP TRACKING
    if (isTrackingRescue) {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      setWatchId(null);

      if (currentUserMarkerRef.current) {
        currentUserMarkerRef.current.setMap(null);
        currentUserMarkerRef.current = null;
      }

      if (pathPolylineRef.current) {
        pathPolylineRef.current.setMap(null);
        pathPolylineRef.current = null;
        pathCoordinatesRef.current = [];
      }

      setIsTrackingRescue(false);
      Swal.fire("Rescue Stopped", "You have stopped tracking.", "info");
      return;
    }

    // START TRACKING
    setIsTrackingRescue(true);

    const rescuesRef = collection(db, "Rescues");
    let userDocId = null;

    // CHECK IF USER ALREADY HAS A RECORD
    try {
      const q = query(rescuesRef, where("uid", "==", auth.currentUser.uid));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        // User already has a record — store its docId for updates
        userDocId = snapshot.docs[0].id;
      } else {
        // No record yet — create one immediately
        const newDocRef = await addDoc(rescuesRef, {
          uid: auth.currentUser.uid,
          name: currentUserName,
          latitude: gpsData?.Latitude || 0,
          longitude: gpsData?.Longitude || 0,
          locationName: "",
          timestamp: serverTimestamp(),
        });
        userDocId = newDocRef.id;
      }
    } catch (err) {
      console.error("Error initializing Firestore record:", err.message);
    }

    // Initialize path coordinates
    if (gpsData && pathCoordinatesRef.current.length === 0) {
      pathCoordinatesRef.current.push({ lat: gpsData.Latitude, lng: gpsData.Longitude });
    }

    if (!pathPolylineRef.current) {
      pathPolylineRef.current = new window.google.maps.Polyline({
        path: pathCoordinatesRef.current,
        geodesic: true,
        strokeColor: "#FF0000",
        strokeOpacity: 1.0,
        strokeWeight: 4,
        map,
      });
    }

    // START WATCHING POSITION
    const id = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const locationName = await getLocationName(latitude, longitude);

        // Distance check
        const lastPoint = pathCoordinatesRef.current[pathCoordinatesRef.current.length - 1];
        const distance = lastPoint
          ? getDistanceFromLatLonInMeters(lastPoint.lat, lastPoint.lng, latitude, longitude)
          : 0;
        if (distance < 3) return;

        // Directions API append
        const directionsService = new window.google.maps.DirectionsService();
        if (lastPoint) {
          directionsService.route(
            {
              origin: lastPoint,
              destination: { lat: latitude, lng: longitude },
              travelMode: window.google.maps.TravelMode.WALKING,
            },
            (result, status) => {
              if (status === "OK" && result.routes.length > 0) {
                pathCoordinatesRef.current.push(...result.routes[0].overview_path);
              } else {
                pathCoordinatesRef.current.push({ lat: latitude, lng: longitude });
              }
              pathPolylineRef.current.setPath(pathCoordinatesRef.current);
            }
          );
        }

        // Update or create rescuer marker
        if (currentUserMarkerRef.current) {
          currentUserMarkerRef.current.setPosition({ lat: latitude, lng: longitude });
        } else {
          const marker = new window.google.maps.Marker({
            position: { lat: latitude, lng: longitude },
            map,
            title: `Rescuer: ${currentUserName}`,
            icon: "/assets/img/rescuer_icon.png",
          });
          const infoWindow = new window.google.maps.InfoWindow({
            content: `<div>
            <p><strong>Name:</strong> ${currentUserName}</p>
            <p><strong>Latitude:</strong> ${latitude}</p>
            <p><strong>Longitude:</strong> ${longitude}</p>
            <p><strong>Location:</strong> ${locationName}</p>
            <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          </div>`,
          });
          marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
          currentUserMarkerRef.current = marker;
        }

        map.panTo({ lat: latitude, lng: longitude });

        // UPDATE FIRESTORE
        if (userDocId) {
          try {
            await updateDoc(doc(db, "Rescues", userDocId), {
              latitude,
              longitude,
              locationName,
              timestamp: serverTimestamp(),
            });
          } catch (err) {
            console.error("Error updating Firestore:", err.message);
          }
        }
      },
      (err) => Swal.fire("Error", `Failed to get location: ${err.message}`, "error"),
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    setWatchId(id);
  };

  // ------------------------- Helpers -------------------------
  function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // meters
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  function deg2rad(deg) { return deg * (Math.PI / 180); }

  useEffect(() => {
    const initRealtimeRef = dbRefRealtime(database, "GPS_Details");

    const unsubscribe = onValue(initRealtimeRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const { Latitude, Longitude } = data;

        // Initialize path coordinates only if empty
        if (pathCoordinatesRef.current.length === 0) {
          pathCoordinatesRef.current.push({ lat: Latitude, lng: Longitude });

          // Create polyline
          if (mapInstanceRef.current && !pathPolylineRef.current) {
            pathPolylineRef.current = new window.google.maps.Polyline({
              path: pathCoordinatesRef.current,
              geodesic: true,
              strokeColor: "#FF0000",
              strokeOpacity: 1.0,
              strokeWeight: 4,
              map: mapInstanceRef.current,
            });
          }
        }
      }
    });

    return () => unsubscribe();
  }, []);



  const handleDeleteLog = async () => {
    if (!editingLog) return;

    const confirm = await Swal.fire({
      title: "Are you sure?",
      text: "This log will be permanently deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    });

    if (confirm.isConfirmed) {
      try {
        await remove(dbRef(database, `GPS_Logs/${editingLog.id}`));
        Swal.fire("Deleted!", "Log has been deleted.", "success");
        setShowLogModal(false);
        setSelectedLog(null);
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    }
  };

  const handleUpdateLog = async () => {
    if (!editingLog) return;

    try {
      await update(dbRef(database, `GPS_Logs/${editingLog.id}`), {
        MotionStatus: editingLog.MotionStatus,
        BPM: editingLog.BPM,
      });

      Swal.fire("Updated!", "Log has been updated.", "success");
      setShowLogModal(false);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
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

  // Initialize map once
  useEffect(() => {
    if (!window.google || !mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 14.5995, lng: 120.9842 },
        zoom: 16  ,
      });
    }
  }, []);

  // Update markers without recreating map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear all markers first
    if (realtimeMarkerRef.current) {
      realtimeMarkerRef.current.setMap(null);
      realtimeMarkerRef.current = null;
    }

    logMarkersRef.current.forEach((m) => m.setMap(null));
    logMarkersRef.current = [];

    // Only show markers based on the active tab
    if (activeTab === "realtime" && gpsData) {
      // Realtime marker
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
      realtimeMarkerRef.current = marker;

      map.panTo({ lat: gpsData.Latitude, lng: gpsData.Longitude });

      // Also show rescuer marker if tracking
      if (rescuerMarker) {
        rescuerMarker.setMap(map);
        map.panTo(rescuerMarker.getPosition());
      }
    }

    if (activeTab === "logs") {
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
          logMarkersRef.current.push(marker);
        });
    }
  }, [gpsData, logs, activeTab, selectedDate, rescuerMarker]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const rescuesRef = collection(db, "Rescues");

    // Object para i-track ang mga markers sa map per document id
    const markers = {};

    const unsubscribe = onSnapshot(rescuesRef, (snapshot) => {
      const currentDocIds = new Set();

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const docId = docSnap.id;
        currentDocIds.add(docId);

        if (markers[docId]) {
          // Update position kung existing na
          markers[docId].setPosition({ lat: data.latitude, lng: data.longitude });
        } else {
          // Create new marker
          const marker = new window.google.maps.Marker({
            position: { lat: data.latitude, lng: data.longitude },
            map,
            title: `Rescuer: ${data.name}`,
            icon: "/assets/img/rescuer_icon.png",
          });

          const infoWindow = new window.google.maps.InfoWindow({
            content: `<div>
    <p><strong>Name:</strong> ${currentUserName}</p>
    <p><strong>Latitude:</strong> ${data.latitude}</p>
    <p><strong>Longitude:</strong> ${data.longitude}</p>
    <p><strong>Location:</strong> ${data.locationName}</p>
    <p><strong>Timestamp:</strong> ${data.timestamp}</p>
  </div>`,
          });

          marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
          markers[docId] = marker;
        }
      });

      // Remove markers na wala na sa Firestore
      Object.keys(markers).forEach((docId) => {
        if (!currentDocIds.has(docId)) {
          markers[docId].setMap(null);
          delete markers[docId];
        }
      });
    });

    return () => unsubscribe(); // cleanup
  }, []);
  // ------------------------- Initialize Path on Map Load -------------------------
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    if (!auth.currentUser) return;

    const fetchAndDrawPath = async () => {
      try {
        const logsQuery = query(
          collection(db, "GPS_Logs"),
          where("uid", "==", auth.currentUser.uid)
        );
        const snapshot = await getDocs(logsQuery);
        if (!snapshot.empty) {
          const coords = snapshot.docs
            .map(doc => doc.data())
            .sort((a, b) => a.UnixTime - b.UnixTime)
            .map(d => ({ lat: d.Latitude, lng: d.Longitude }));

          if (coords.length < 2) return;

          const directionsService = new window.google.maps.DirectionsService();
          let fullPath = [];

          for (let i = 0; i < coords.length - 1; i++) {
            const start = coords[i];
            const end = coords[i + 1];

            await new Promise((resolve) => {
              directionsService.route(
                {
                  origin: start,
                  destination: end,
                  travelMode: window.google.maps.TravelMode.WALKING,
                },
                (result, status) => {
                  if (status === "OK" && result.routes.length > 0) {
                    fullPath.push(...result.routes[0].overview_path);
                  } else {
                    fullPath.push(start, end);
                  }
                  resolve();
                }
              );
            });
          }

          pathCoordinatesRef.current = fullPath;

          pathPolylineRef.current = new window.google.maps.Polyline({
            path: pathCoordinatesRef.current,
            geodesic: true,
            strokeColor: "#FF0000",
            strokeOpacity: 1.0,
            strokeWeight: 4,
            map,
          });

          map.panTo(pathCoordinatesRef.current[pathCoordinatesRef.current.length - 1]);
        }
      } catch (err) {
        console.error("Error fetching path:", err);
      }
    };

    fetchAndDrawPath();
  }, [mapInstanceRef.current]);

  // ------------------------- Initialize Map & Draw Existing Path -------------------------
  useEffect(() => {
    if (!window.google || !mapRef.current) return;
    if (!auth.currentUser) return;

    // Initialize map once
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 14.5995, lng: 120.9842 },
        zoom: 16,
      });
    }
    const map = mapInstanceRef.current;

    // Fetch previous path and draw polyline
    const fetchAndDrawPath = async () => {
      try {
        const logsQuery = query(
          collection(db, "GPS_Logs"),
          where("uid", "==", auth.currentUser.uid)
        );
        const snapshot = await getDocs(logsQuery);
        if (!snapshot.empty) {
          const coords = snapshot.docs
            .map(doc => doc.data())
            .sort((a, b) => a.UnixTime - b.UnixTime)
            .map(d => ({ lat: d.Latitude, lng: d.Longitude }));

          if (coords.length < 2) return;

          const directionsService = new window.google.maps.DirectionsService();
          let fullPath = [];

          for (let i = 0; i < coords.length - 1; i++) {
            const start = coords[i];
            const end = coords[i + 1];
            await new Promise((resolve) => {
              directionsService.route(
                {
                  origin: start,
                  destination: end,
                  travelMode: window.google.maps.TravelMode.WALKING,
                },
                (result, status) => {
                  if (status === "OK" && result.routes.length > 0) {
                    fullPath.push(...result.routes[0].overview_path);
                  } else {
                    fullPath.push(start, end);
                  }
                  resolve();
                }
              );
            });
          }

          pathCoordinatesRef.current = fullPath;

          // Draw polyline
          if (!pathPolylineRef.current) {
            pathPolylineRef.current = new window.google.maps.Polyline({
              path: pathCoordinatesRef.current,
              geodesic: true,
              strokeColor: "#FF0000",
              strokeOpacity: 1.0,
              strokeWeight: 4,
              map,
            });
          } else {
            pathPolylineRef.current.setPath(pathCoordinatesRef.current);
          }

          map.panTo(pathCoordinatesRef.current[pathCoordinatesRef.current.length - 1]);
        }
      } catch (err) {
        console.error("Error fetching previous path:", err);
      }
    };

    fetchAndDrawPath();

    // ------------------------- Realtime Rescuer Marker Update -------------------------
    const rescuesRef = collection(db, "Rescues");
    const unsubscribe = onSnapshot(rescuesRef, (snapshot) => {
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const uid = data.uid;
        const pos = { lat: data.latitude, lng: data.longitude };

        if (rescuerMarker && rescuerMarker.uid === uid) {
          // update existing marker
          rescuerMarker.setPosition(pos);
        } else {
          // create new marker
          const marker = new window.google.maps.Marker({
            position: pos,
            map,
            title: `Rescuer: ${data.name}`,
            icon: {
              url: "/assets/img/ascelis_logo.png",
              scaledSize: new window.google.maps.Size(40, 40),
            },
          });
          const infoWindow = new window.google.maps.InfoWindow({
            content: `<div><p><strong>Name:</strong> ${data.name}</p><p><strong>Location:</strong> ${data.locationName}</p></div>`,
          });
          marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
          marker.uid = uid;

          // store in state so we can update next time
          setRescuerMarker(marker);
        }
      });
    });

    return () => unsubscribe();
  }, [mapRef.current]);

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
      const hourRecords = selectedDayLogs.filter(
        (r) => parseInt(r.DateTime.split(" ")[1].split(":")[0], 10) === i
      );
      return {
        hour: i,
        Moving: hourRecords.reduce((acc, r) => acc + (r.MotionStatus === "MOVING" ? 1 : 0), 0),
        BPM: hourRecords.length
          ? hourRecords.reduce((acc, r) => acc + (r.BPM || 0), 0) / hourRecords.length
          : 0,
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
          tension: 0,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    };

    const options = { responsive: true, maintainAspectRatio: false };
    return <Line data={chartData} options={options} />;
  };

  // ------------------------- JSX RETURN -------------------------
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
          <button
            className={activeTab === "realtime" ? "active" : ""}
            onClick={() => { setActiveTab("realtime"); setSelectedLog(null); }}
          >
            Realtime
          </button>
          <button
            className={activeTab === "logs" ? "active" : ""}
            onClick={() => { setActiveTab("logs"); setSelectedLog(null); }}
          >
            Logs
          </button>
        </div>

        {/* Logs Controls */}
        {activeTab === "logs" && (
          <div className="logs-controls">
            <button className="summary-btn-large" onClick={openSummaryModalForDay}>
              Summary
            </button>
            <div className="date-filter">
              <label htmlFor="filter-date"><strong>Select Date:</strong></label>
              <input
                type="date"
                id="filter-date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
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
                <p><strong>Location Name:</strong> {gpsData.LocationName}</p>
                <p><strong>Moving Distance (cm):</strong> {gpsData.DistanceTravelled}</p>
                <p><strong>Moving:</strong> {gpsData.MotionStatus}</p>
                <p><strong>BPM:</strong> {gpsData.BPM || "N/A"}</p>

                <div style={{ marginTop: "20px" }}>
                  <button
                    className="trackMeBtn"
                    onClick={handleToggleRescue}
                    style={{
                      width: "100%",
                      height: "50px",
                      backgroundColor: isTrackingRescue ? "#FF4C4C" : "#FF8C00",
                      color: "white",
                      fontWeight: "bold",
                      fontSize: "16px",
                      borderRadius: "8px",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {isTrackingRescue ? "Stop Rescue" : "Start Rescue / Track Me"}
                  </button>
                </div>

              </>
            ) : <p>Loading Realtime data...</p>
          ) : (
            logs.length > 0 ? (
              <div className="logs-list">
                {logs.filter((log) => {
                  const [month, day, year] = log.DateTime.split(" ")[0].split("/");
                  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` === selectedDate;
                }).map((log) => (
                  <div
                    key={log.id}
                    className={`log-entry ${selectedLog?.id === log.id ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedLog(log);
                      setEditingLog(log);
                      setShowLogModal(true);
                    }}
                  >
                    <p><strong>ID:</strong> {log.id}</p>
                    <p><strong>DateTime:</strong> {log.DateTime}</p>
                    <p><strong>Moving Distance (cm):</strong> {gpsData.DistanceTravelled}</p>
                    <p><strong>Moving:</strong> {log.MotionStatus}</p>
                    <p><strong>BPM:</strong> {log.BPM || "N/A"}</p>
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

      {/* LOG DETAILS MODAL */}
      {showLogModal && editingLog && (
        <div className="modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>


            <h2>Log Details</h2>

            <p><strong>ID:</strong> {editingLog.id}</p>
            <p><strong>DateTime:</strong> {editingLog.DateTime}</p>
            <p><strong>Latitude:</strong> {editingLog.Latitude}</p>
            <p><strong>Longitude:</strong> {editingLog.Longitude}</p>
            <p><strong>Location:</strong> {editingLog.LocationName}</p>

            <p><strong>Moving Distance (cm):</strong> {editingLog.DistanceTravelled}</p>

            <label><strong>Motion Status:</strong></label>

            <div className="form-group">
              <br />
              <input
                type="text"
                value={editingLog.MotionStatus}
                onChange={(e) =>
                  setEditingLog({ ...editingLog, MotionStatus: e.target.value })
                }
              />
            </div>


            <label><strong>BPM:</strong></label>

            <div className="form-group">
              <br />
              <input
                type="number"
                value={editingLog.BPM || ""}
                onChange={(e) =>
                  setEditingLog({ ...editingLog, BPM: Number(e.target.value) })
                }
              />
            </div>


            <div
              style={{
                marginTop: "50px",
              }}
            >
              <hr />
            </div>

            <div
              style={{
                marginTop: "20px",
                display: "flex",
                gap: "10px"
              }}
            >
              <button
                className="saveChangeBtn"
                onClick={handleUpdateLog}
                style={{
                  flex: 1,
                  height: "40px",
                  backgroundColor: "#1E90FF",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                }}
              >
                <FaSave /> Save Changes
              </button>

              <button
                className="deleteBtn"
                onClick={handleDeleteLog}
                style={{
                  flex: 1,
                  height: "40px",
                  backgroundColor: "#FF4C4C",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                }}
              >
                <FaTrash /> Delete
              </button>

              <button
                className="closeModalBtn2"
                onClick={() => setShowLogModal(false)}
                style={{
                  flex: 1,
                  height: "40px",
                  backgroundColor: "#A9A9A9",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                }}
              >
                <FaTimes /> Close
              </button>
            </div>

          </div>
        </div>
      )}

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
            {summaryData.length > 0 && (
              <div className="chart-container">
                <LineChart data={summaryData} tab={summaryTab} />
              </div>
            )}
            <button className="closeModalBtn" onClick={() => setShowSummaryModal(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}