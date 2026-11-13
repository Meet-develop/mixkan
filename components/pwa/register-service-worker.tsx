"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { syncPushSubscription } from "@/lib/push-client";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const register = async () => {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });

      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (userId) {
        await syncPushSubscription(userId);
      }
    };

    register().catch((error) => {
      console.error("Failed to register service worker or sync push subscription", error);
    });
  }, []);

  return null;
}
