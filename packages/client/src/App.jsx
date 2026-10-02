import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/common/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import GuestLayout from './components/layout/GuestLayout';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// Photographer pages
import DashboardPage from './pages/dashboard/DashboardPage';
import EventListPage from './pages/events/EventListPage';
import CreateEventPage from './pages/events/CreateEventPage';
import EventDetailPage from './pages/events/EventDetailPage';
import UploadPage from './pages/events/UploadPage';
import PlansPage from './pages/subscription/PlansPage';
import SubscriptionPage from './pages/subscription/SubscriptionPage';
import ProfilePage from './pages/profile/ProfilePage';

// Admin pages
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import TenantManagePage from './pages/admin/TenantManagePage';
import PlanManagePage from './pages/admin/PlanManagePage';

// Guest pages
import GuestLandingPage from './pages/guest/GuestLandingPage';
import ConsentPage from './pages/guest/ConsentPage';
import GalleryPage from './pages/guest/GalleryPage';

/**
 * App root â€” full route tree.
 */
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Guest-facing routes (no auth required) */}
          <Route element={<GuestLayout />}>
            <Route path="/guest/events/:token" element={<GuestLandingPage />} />
            <Route path="/guest/consent/:token" element={<ConsentPage />} />
            <Route path="/guest/gallery/:galleryToken" element={<GalleryPage />} />
          </Route>

          {/* Authenticated photographer routes */}
          <Route element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/events" element={<EventListPage />} />
            <Route path="/events/new" element={<CreateEventPage />} />
            <Route path="/events/:eventId" element={<EventDetailPage />} />
            <Route path="/events/:eventId/upload" element={<UploadPage />} />
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/subscription" element={<SubscriptionPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          {/* Admin routes */}
          <Route element={
            <ProtectedRoute requiredRole="admin">
              <AppLayout />
            </ProtectedRoute>
          }>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/tenants" element={<TenantManagePage />} />
            <Route path="/admin/plans" element={<PlanManagePage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          {/* Redirects */}
          <Route path="/" element={<SmartRedirect />} />
          <Route path="*" element={<SmartRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

/**
 * SmartRedirect — sends admin users to /admin, photographers to /dashboard.
 */
function SmartRedirect() {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default App;
