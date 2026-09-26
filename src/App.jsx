import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Visitors from '@/pages/Visitors';
import ServiceTickets from '@/pages/ServiceTickets';
import Profile from '@/pages/Profile';
import Billing from '@/pages/Billing';
import Onboarding from '@/pages/Onboarding';
import ForceChangePassword from '@/pages/ForceChangePassword';
import SuperAdminDashboard from '@/pages/SuperAdminDashboard';
import NoticeBoard from '@/pages/NoticeBoard';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';
import { Toaster as SonnerToaster } from 'sonner';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated, user, checkAppState } = useAuth();

  // Show loading spinner while checking the local session
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Not signed in yet: show the local login screen for every route.
  if (!isAuthenticated || !user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
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

  // Show onboarding for new users who haven't selected a society
  if (!user.society_id) {
    return <Onboarding onComplete={checkAppState} />;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/Dashboard" replace />} />
      <Route element={<AppLayout />}>
        <Route path="/Dashboard" element={<Dashboard />} />
        <Route path="/Visitors" element={<Visitors />} />
        <Route path="/ServiceTickets" element={<ServiceTickets />} />
        <Route path="/Billing" element={<Billing />} />
        <Route path="/NoticeBoard" element={<NoticeBoard />} />
        <Route path="/Profile" element={<Profile />} />
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
