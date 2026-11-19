import { lazy, Suspense, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import Login from '@/pages/Login';
// import SuperAdminLogin from '@/pages/SuperAdminLogin';
// import Dashboard from '@/pages/Dashboard';
// import Visitors from '@/pages/Visitors';
// import ServiceTickets from '@/pages/ServiceTickets';
// import Profile from '@/pages/Profile';
// import Members from '@/pages/Members';
// import Billing from '@/pages/Billing';
// import DuesRestricted from '@/pages/DuesRestricted';
// import PrivacyPolicy from '@/pages/PrivacyPolicy';
// import ForceChangePassword from '@/pages/ForceChangePassword';
// import SuperAdminDashboard from '@/pages/SuperAdminDashboard';
//import NoticeBoard from '@/pages/NoticeBoard';
//import Community from '@/pages/Community';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';
import { Toaster as SonnerToaster } from 'sonner';
// import Signup from '@/pages/Signup';
// import Amenities from '@/pages/Amenities';
// import PreApprovals from '@/pages/PreApprovals';
// import GatePasses from '@/pages/GatePasses';
//import Home from '@/pages/Home';
import { Capacitor } from '@capacitor/core';
import UpdateBanner from '@/components/UpdateBanner';
import PushSetup from '@/components/PushSetup';
import EmergencyButton from '@/components/EmergencyButton';
import EmergencyAlerts from '@/components/EmergencyAlerts';
import WelcomeBanner from '@/components/announcement/WelcomeBanner';

const SuperAdminLogin = lazy(() => import('@/pages/SuperAdminLogin'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Visitors = lazy(() => import('@/pages/Visitors'));
const ServiceTickets = lazy(() => import('@/pages/ServiceTickets'));
const Profile = lazy(() => import('@/pages/Profile'));
const Members = lazy(() => import('@/pages/Members'));
const Billing = lazy(() => import('@/pages/Billing'));
const DuesRestricted = lazy(() => import('@/pages/DuesRestricted'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const Terms = lazy(() => import('@/pages/Terms'));
const DeleteAccount = lazy(() => import('@/pages/DeleteAccount'));
const ForceChangePassword = lazy(() => import('@/pages/ForceChangePassword'));
const SuperAdminDashboard = lazy(() => import('@/pages/SuperAdminDashboard'));
const NoticeBoard = lazy(() => import('@/pages/NoticeBoard'));
const Community = lazy(() => import('@/pages/Community'));
const Signup = lazy(() => import('@/pages/Signup'));
const Amenities = lazy(() => import('@/pages/Amenities'));
const PreApprovals = lazy(() => import('@/pages/PreApprovals'));
const GatePasses = lazy(() => import('@/pages/GatePasses'));
const Home = lazy(() => import('@/pages/Home'));
const AboutUs = lazy(() => import('@/pages/AboutUs'));
const ContactUs = lazy(() => import('@/pages/ContactUs'));
const FAQ = lazy(() => import('@/pages/FAQ'));

// On the home page, show wwgate.in instead of wwgate.in/#/ (the page itself works the same).
const HideHomeHash = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === '/' && window.location.hash) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
  }, [pathname]);
  return null;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated, user } = useAuth();
  // Security guards start on the Visitors (gate) page. Everyone else starts on the Dashboard.
  const homePath = user?.role === 'guard' ? '/Visitors' : '/Dashboard';

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
        <Route path="/s/:code" element={<Login />} />
         <Route path="/privacy" element={<PrivacyPolicy />} />
         <Route path="/terms" element={<Terms />} />
        <Route path="/delete-account" element={<DeleteAccount />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/contact" element={<ContactUs />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/superadmin-login" element={<SuperAdminLogin />} />
        {!isNative && <Route path="/signup" element={<Signup />} />}
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

   // A flat with a bill overdue past the society's limit can only use Billing.
  if (user.dues_blocked) {
    return <DuesRestricted />;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={<Navigate to={homePath} replace />} />
      {/* Already logged in — bounce these public-only pages to the dashboard
          instead of 404ing if the person lands here from a bookmark/old link. */}
      <Route path="/login" element={<Navigate to={homePath} replace />} />
            <Route path="/signup" element={<Navigate to={homePath} replace />} />
      <Route path="/s/:code" element={<Navigate to={homePath} replace />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/delete-account" element={<DeleteAccount />} />
      <Route path="/about" element={<AboutUs />} />
      <Route path="/contact" element={<ContactUs />} />
      <Route path="/faq" element={<FAQ />} />
      <Route element={<AppLayout />}>
        <Route path="/Dashboard" element={<Dashboard />} />
        <Route path="/Visitors" element={<Visitors />} />
        <Route path="/ServiceTickets" element={<ServiceTickets />} />
        <Route path="/Billing" element={<Billing />} />
        <Route path="/NoticeBoard" element={<NoticeBoard />} />
        <Route path="/Community" element={<Community />} />
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
          <HideHomeHash />
          <UpdateBanner />
                   <PushSetup />
          <EmergencyButton />
          <EmergencyAlerts />
           <WelcomeBanner />
          <NotificationProvider>
                        <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>}>
              <AuthenticatedApp />
            </Suspense>
          </NotificationProvider>
        </Router>
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
