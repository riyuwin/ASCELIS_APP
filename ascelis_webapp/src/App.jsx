import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/auth/Login"; 
import Dashboard from "./pages/admin_page/Dashboard";
import Signup from "./components/auth/Signup";
import AccountVerification from "./pages/admin_page/AccountVerification";
import AdminMenu from "./pages/admin_page/AdminMenu";

function App() {
  return (
    <>

      <BrowserRouter>
        <Routes>
          {/* Auth Pages */}
          <Route path="/" element={<Login />} /> 
          <Route path="/signup" element={<Signup />} /> 

          {/* Admin Pages */}
          <Route path="/admin/dashboard" element={<Dashboard />} />
          <Route path="/admin/account_verification" element={<AccountVerification />} />
          <Route path="/admin/menu" element={<AdminMenu />} />

        </Routes>
      </ BrowserRouter>

    </>
  )
}

export default App
