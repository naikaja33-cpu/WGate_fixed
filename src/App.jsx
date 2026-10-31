import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import Login from '@/pages/Login';
import SuperAdminLogin from '@/pages/SuperAdminLogin';
import Dashboard from '@/pages/Dashboard';
import Visitors from '@/pages/Visitors';
import ServiceTickets from '@/pages/ServiceTickets';
import Profile from '@/pages/Profile';
import Members from '@/pages/Members';
import Billing from '@/pages/Billing';
import ForceChangePassword from '@/pages/ForceChangePassword';
import SuperAdminDashboard from '@/pages/SuperAdminDashboard';
import NoticeBoard from '@/pages/NoticeBoard';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';
import { Toaster as SonnerToaster } from 'sonner';
import Signup from '@/pages/Signup';
import Amenities from '@/pages/Amenities';
import PreApprovals from '@/pages/PreApprovals';
import GatePasses from '@/pages/GatePasses';
import Home from '@/pages/Home';
import { Capacitor } from '@capacitor/core';
import UpdateBanner from '@/components/UpdateBanner';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated, user } = useAuth();

  // Show loading spinner while checking the local session
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

    // Not signed in yet. The native Android app skips the marketing Home
  // page entirely and goes straight to Login — Home is web-only.
  if (!isAuthenticated || !user) {
    const isNative = Capacitor.isNativePlatform();
    return (
      <Routes>
        {!isNative && <Route path="/" element={<Home />} />}
        <Route path="/login" element={<Login />} />
        <Route path="/superadmin-login" element={<SuperAdminLogin />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={isNative ? <Login /> : <Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Force a password change before anything else if the account still
  // has its original/temporary password.
  if (user.must_change_password) {
    return <ForceChangePassword />;
  }

  // Super admins aren't part of any society — send them straight to
  // their own dashboard instead of the normal onboarding/app flow.
  if (user.role === 'superadmin') {
    return <SuperAdminDashboard />;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/Dashboard" replace />} />
      {/* Already logged in — bounce these public-only pages to the dashboard
          instead of 404ing if the person lands here from a bookmark/old link. */}
      <Route path="/login" element={<Navigate to="/Dashboard" replace />} />
      <Route path="/signup" element={<Navigate to="/Dashboard" replace />} />
      <Route element={<AppLayout />}>
        <Route path="/Dashboard" element={<Dashboard />} />
        <Route path="/Visitors" element={<Visitors />} />
        <Route path="/ServiceTickets" element={<ServiceTickets />} />
        <Route path="/Billing" element={<Billing />} />
        <Route path="/NoticeBoard" element={<NoticeBoard />} />
        <Route path="/Profile" element={<Profile />} />
        <Route path="/Members" element={<Members />} />
        <Route path="/Amenities" element={<Amenities />} />
        <Route path="/PreApprovals" element={<PreApprovals />} />
        <Route path="/GatePasses" element={<GatePasses />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
      
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <UpdateBanner />
          <NotificationProvider>
            <AuthenticatedApp />
          </NotificationProvider>
        </Router>
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
