import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import LoginForm from '@/components/LoginForm';
import AppShell from '@/components/layout/AppShell';
import Dashboard from '@/components/Dashboard';
import CheckInPage from '@/components/check-in/CheckInPage';
import MyFollowupsPage from '@/components/followups/MyFollowupsPage';
import BoardPage from '@/components/board/BoardPage';
import NeedsAttentionPage from '@/components/attention/NeedsAttentionPage';
import Home from '@/components/home/Home';
import Landing from '@/components/layout/Landing';
import RoleGate from '@/components/layout/RoleGate';
import M1Page from '@/components/m1/M1Page';
import CertificatePrintPage from '@/components/m1/CertificatePrintPage';
import BaptismPage from '@/components/baptism/BaptismPage';
import ReplyPage from '@/components/reply/ReplyPage';
import ErrorBoundary from '@/components/ErrorBoundary';
import { AuthProvider, useAuth } from '@/context/AuthContext';

function ProtectedRoute() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return status === 'authed' ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginForm />} />
        <Route path="/reply/:token" element={<ReplyPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Landing />} />
            <Route element={<RoleGate />}>
              <Route path="/home" element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/check-in" element={<CheckInPage />} />
              <Route path="/my-followups" element={<MyFollowupsPage />} />
              <Route path="/board" element={<BoardPage />} />
              <Route path="/needs-attention" element={<NeedsAttentionPage />} />
              <Route path="/m1" element={<M1Page />} />
              <Route
                path="/m1/certificates/print"
                element={<CertificatePrintPage />}
              />
              <Route path="/baptism" element={<BaptismPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" richColors closeButton />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}