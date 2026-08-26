import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import Navbar from './components/Navbar';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy loaded page components for performance
const Landing = lazy(() => import('./pages/Landing'));
const StudentPortal = lazy(() => import('./pages/StudentPortal'));
const GuestPortal = lazy(() => import('./pages/GuestPortal'));
const CashierDashboard = lazy(() => import('./pages/CashierDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const StudentProfile = lazy(() => import('./pages/StudentProfile'));
const SecureAccess = lazy(() => import('./pages/SecureAccess'));
const KitchenDisplay = lazy(() => import('./pages/KitchenDisplay'));
const InstallPrompt = lazy(() => import('./components/InstallPrompt'));

const ProtectedRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

// Global fallback loader
const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
    <div className="spinner" />
  </div>
);

function AppContent() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh' }}>
        <ErrorBoundary>
        <Navbar />
        <main className="main-content page-enter">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/secure-access" element={<SecureAccess />} />
              <Route path="/student" element={<ProtectedRoute roles={['student']}><StudentPortal /></ProtectedRoute>} />
              <Route path="/student/profile" element={<ProtectedRoute roles={['student']}><StudentProfile /></ProtectedRoute>} />
              <Route path="/guest" element={<ProtectedRoute roles={['guest']}><GuestPortal /></ProtectedRoute>} />
              <Route path="/cashier" element={<ProtectedRoute roles={['staff']}><CashierDashboard /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />
              <Route path="/kitchen" element={<ProtectedRoute roles={['staff', 'admin']}><KitchenDisplay /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
        <Suspense fallback={null}>
          <InstallPrompt />
        </Suspense>
        </ErrorBoundary>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CartProvider>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
