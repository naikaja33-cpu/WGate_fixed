import Dashboard from './pages/Dashboard';
import Visitors from './pages/Visitors';
import ServiceTickets from './pages/ServiceTickets';
import Billing from './pages/Billing';
import Profile from './pages/Profile';
import AppLayout from './components/layout/AppLayout';

export const PAGES = {
  "Dashboard": Dashboard,
  "Visitors": Visitors,
  "ServiceTickets": ServiceTickets,
  "Billing": Billing,
  "Profile": Profile,
}

export const pagesConfig = {
  mainPage: "Dashboard",
  Pages: PAGES,
  Layout: AppLayout,
};
