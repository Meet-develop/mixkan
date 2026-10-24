"use client";

import { useEffect, useMemo, useState } from "react";
import { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";
import {
  RequestLoadingProvider,
  useRequestLoading,
} from "@/contexts/request-loading-context";
import { RequestLoadingOverlay } from "@/components/ui/request-loading-overlay";

const isEventDetailPath = (pathname: string) => /^\/events\/[^/]+\/?$/.test(pathname);

function GlobalRequestLoadingOverlay() {
  const { isOverlayVisible } = useRequestLoading();
  return <RequestLoadingOverlay visible={isOverlayVisible} />;
}

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  const isPublicPath = useMemo(() => {
    if (pathname === "/") return true;
    if (pathname.startsWith("/login")) return true;
    if (pathname.startsWith("/signup")) return true;
    if (pathname.startsWith("/onboarding")) return true;
    if (pathname.startsWith("/auth/callback")) return true;
    if (pathname.startsWith("/diagnosis")) return true;
    return isEventDetailPath(pathname);
  }, [pathname]);

  useEffect(() => {
    let isMounted = true;

    const syncSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      setIsAuthenticated(Boolean(data.session));
      setIsAuthChecked(true);
    };

    syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        setIsAuthenticated(true);
        setIsAuthChecked(true);
        return;
      }

      // Guard against transient null session notifications.
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      setIsAuthenticated(Boolean(data.session));
      setIsAuthChecked(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthChecked || isPublicPath || isAuthenticated) return;
    router.replace("/login");
  }, [isAuthChecked, isAuthenticated, isPublicPath, router]);

  if (!isPublicPath && (!isAuthChecked || !isAuthenticated)) {
    return null;
  }

  return (
    <RequestLoadingProvider>
      {children}
      <RegisterServiceWorker />
      <GlobalRequestLoadingOverlay />
    </RequestLoadingProvider>
  );
}
