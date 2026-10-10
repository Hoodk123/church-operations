import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { Toaster } from 'sonner';
import { createClient } from '@/lib/supabase/client';
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

function ProtectedRoute() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthed(!!data.session);
      setChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;
        if (event === 'SIGNED_OUT') {
          setAuthed(false);
          return;
        }

        if (session) {
          setAuthed(true);
        } else {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            setAuthed(true);
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return authed ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginForm />} />
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
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" richColors closeButton />
    </BrowserRouter>
  );
}