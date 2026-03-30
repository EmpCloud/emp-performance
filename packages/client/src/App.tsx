import { Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { isLoggedIn, useAuthStore, extractSSOToken } from "@/lib/auth-store";
import { apiPost } from "@/api/client";
import { AppRoutes } from "@/routes";

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
    </div>
  );
}

function AuthRedirect() {
  return isLoggedIn() ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
}

function SSOGate({ children }: { children: React.ReactNode }) {
  const login = useAuthStore((s) => s.login);
  const [ssoToken] = useState(() => extractSSOToken());
  const [ready, setReady] = useState(!ssoToken);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ssoToken) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await apiPost<{
          user: any;
          tokens: { accessToken: string; refreshToken: string };
        }>("/auth/sso", { token: ssoToken });

        if (cancelled) return;

        const { user, tokens } = res.data!;
        login(user, tokens);

        if (window.location.pathname === "/" || window.location.pathname === "/login") {
          window.location.replace("/dashboard");
          return;
        }
        setReady(true);
      } catch (err: any) {
        if (cancelled) return;
        console.error("SSO exchange failed:", err);
        setError("SSO login failed. Please try logging in manually.");
        setReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [ssoToken, login]);

  if (!ready) return <PageLoader />;
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <a href="/login" className="text-brand-600 underline">Go to login</a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <SSOGate>
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Root redirect */}
        <Route path="/" element={<AuthRedirect />} />

        {/* All app routes */}
        {AppRoutes()}
      </Routes>
    </Suspense>
    </SSOGate>
  );
}
