import React, { useEffect, useState } from "react";
import "../../css/accountverification.css";
import { db } from "../../firebase";
import { collection, getDocs, doc, updateDoc, query, orderBy } from "firebase/firestore";
import Swal from "sweetalert2";

export default function AccountVerificationPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search and pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 10;

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "-";
    const dateObj = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const options = {
      year: "numeric",
      month: "long",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };
    return new Intl.DateTimeFormat("en-US", options).format(dateObj).replace(",", " |");
  };

  // Fetch users from Firestore
  const fetchUsers = async () => {
    try {
      const q = query(collection(db, "AccountInformation"), orderBy("role", "asc"));
      const snapshot = await getDocs(q);
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(usersData);
    } catch (err) {
      console.error("Error fetching users:", err);
      Swal.fire("Error", "Could not fetch users", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Handle account status update
  const handleStatusChange = async (userId, newStatus) => {
    try {
      const userRef = doc(db, "AccountInformation", userId);
      await updateDoc(userRef, { accountStatus: newStatus });
      Swal.fire("Success", `Account status changed to ${newStatus}`, "success");
      fetchUsers(); // refresh list
    } catch (err) {
      console.error("Error updating status:", err);
      Swal.fire("Error", "Could not update account status", "error");
    }
  };

  // Filtered and paginated users
  const filteredUsers = users.filter(
    (user) =>
      user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentRecords = filteredUsers.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = Math.ceil(filteredUsers.length / recordsPerPage);

  return (
    <div className="account-wrapper">
      <header className="admin-header">
        <img src="/assets/img/ascelis_logo.png" alt="ASCELIS Logo" className="admin-logo" />
        <h1 className="admin-title">Account Verification</h1>
      </header>

      <div className="account-main">
        {loading ? (
          <p style={{ color: "#fff", textAlign: "center" }}>Loading users...</p>
        ) : (
          <div className="account-box">
            {/* Search inside account-box */}
            <div className="search-container">
              <input
                type="text"
                placeholder="Search by name, email, role..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            {/* Table */}
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Full Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Account Status</th>
                  <th>Created At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {currentRecords.map((user, index) => (
                  <tr key={user.id}>
                    <td>{indexOfFirstRecord + index + 1}</td>
                    <td>{user.firstName} {user.lastName}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.accountStatus}</td>
                    <td>{formatTimestamp(user.createdAt)}</td>
                    <td className="action-buttons">
                      <button onClick={() => handleStatusChange(user.id, "Deactivated")}>Deactivate</button>
                      <button onClick={() => handleStatusChange(user.id, "Pending")}>Pending</button>
                      <button onClick={() => handleStatusChange(user.id, "Verified")}>Verified</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Prev
                </button>
                <span>Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
