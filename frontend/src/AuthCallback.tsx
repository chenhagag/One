import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import type { User } from "./App";

interface AuthCallbackProps {
  onSuccess: (user: User, profileComplete: boolean) => void;
  onError: (message: string) => void;
}

export default function AuthCallback({ onSuccess, onError }: AuthCallbackProps) {
  const [status, setStatus] = useState("Signing you in...");

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      try {
        // Supabase auto-reads tokens from the URL hash on init,
        // but we call getSession() to be explicit and wait for it.
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          if (!cancelled) onError(sessionError?.message || "No session found after sign-in");
          return;
        }

        setStatus("Setting up your account...");

        // Sync with our backend
        const res = await fetch("/api/auth/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (!cancelled) onError(data.error || "Failed to sync account");
          return;
        }

        const user = await res.json();
        if (!cancelled) {
          onSuccess(user, user.profile_complete !== false);
        }
      } catch {
        if (!cancelled) onError("Something went wrong. Please try again.");
      }
    }

    handleCallback();
    return () => { cancelled = true; };
  }, [onSuccess, onError]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-gray-200 border-t-gray-800" />
        <p className="text-sm text-gray-500">{status}</p>
      </div>
    </div>
  );
}
