import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function GoogleSignInButton() {
  const { login } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;

    const initializeGoogle = () => {
      if (!buttonRef.current) return;

      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            await login(response.credential);
          } catch (err) {
            console.error("Login failed:", err);
          }
        },
      });

      google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
      });

      initialized.current = true;
    };

    // Load Google Identity Services script if not already loaded
    if (typeof google !== "undefined" && google.accounts) {
      initializeGoogle();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;
    document.head.appendChild(script);
  }, [login]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="text-xs text-red-500 p-2">
        Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID in .env
      </div>
    );
  }

  return <div ref={buttonRef} className="flex justify-center py-2" />;
}
