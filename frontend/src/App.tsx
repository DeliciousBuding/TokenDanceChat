import { useEffect, useRef } from "react";
import { ChatLayout } from "@/components/ChatLayout";
import { AuthModal } from "@/components/AuthModal";
import { useChatStore } from "@/stores/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { fetchPublicMessages, getSessionToken, persistSessionToken } from "@/lib/api";

const USERNAME_STORAGE_KEY = "tokendance:username";
const AUTH_STORAGE_KEY = "tokendance:auth";

function generateGuestName(): string {
  return `guest_${Math.random().toString(36).slice(2, 10)}`;
}

function App() {
  const { connect } = useWebSocket();
  const setView = useChatStore((s) => s.setView);
  const setStoreUsername = useChatStore((s) => s.setUsername);
  const setGuest = useChatStore((s) => s.setGuest);
  const setOidcAuth = useChatStore((s) => s.setOidcAuth);
  const clearOidcAuth = useChatStore((s) => s.clearOidcAuth);
  const setShowAuthModal = useChatStore((s) => s.setShowAuthModal);
  const setHistory = useChatStore((s) => s.setHistory);
  const initialSearchRef = useRef(window.location.search);

  useEffect(() => {
    let cancelled = false;

    async function tryAutoConnect(name: string) {
      try {
        if (cancelled) return;
        setStoreUsername(name);
        setGuest(false);
        setView("chat");
        await connect(name);
      } catch {
        if (cancelled) return;
        // Connection failed — clear stale auth and show login modal.
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(USERNAME_STORAGE_KEY);
        persistSessionToken(null);
        clearOidcAuth();
        setShowAuthModal(true);
      }
    }

    async function loadPublicPreview() {
      const messages = await fetchPublicMessages(100);
      if (!cancelled) {
        setHistory(messages);
      }
    }

    async function tryGuestConnect() {
      const name = generateGuestName();
      try {
        if (cancelled) return;
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(USERNAME_STORAGE_KEY);
        persistSessionToken(null);
        clearOidcAuth();
        setStoreUsername(name);
        setGuest(true);
        setView("chat");
        await connect(name);
      } catch {
        if (cancelled) return;
        setStoreUsername("");
        setGuest(false);
        await loadPublicPreview();
      }
    }

    function initialize() {
      // 1. Check OIDC callback params (from TokenDance ID redirect).
      const params = new URLSearchParams(initialSearchRef.current);
      const oidcSuccess = params.get("oidc_success");
      const oidcError = params.get("oidc_error");

      if (oidcSuccess === "1") {
        const redeemID = params.get("oidc_rid");
        window.history.replaceState({}, "", "/");

        if (redeemID) {
          fetch("/api/oidc/redeem", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ redeem_id: redeemID }),
          })
            .then((r) => {
              if (!r.ok) throw new Error("OIDC redeem failed");
              return r.json();
            })
            .then((data: { username?: string; access_token?: string; refresh_token?: string; session_token?: string }) => {
              if (cancelled) return;
              if (!data.username || !data.access_token || !data.refresh_token || !data.session_token) {
                throw new Error("OIDC redeem response missing credentials");
              }
              setOidcAuth(data.access_token, data.refresh_token);
              localStorage.setItem(AUTH_STORAGE_KEY, "true");
              localStorage.setItem(USERNAME_STORAGE_KEY, data.username);
              persistSessionToken(data.session_token);
              tryAutoConnect(data.username);
            })
            .catch(() => {
              if (cancelled) return;
              localStorage.removeItem(AUTH_STORAGE_KEY);
              localStorage.removeItem(USERNAME_STORAGE_KEY);
              persistSessionToken(null);
              clearOidcAuth();
              setShowAuthModal(true);
            });
          return;
        }
      } else if (oidcError) {
        window.history.replaceState({}, "", "/");
        setShowAuthModal(true);
      }

      // 2. Auto-login: check persistent auth flag.
      const isAuth = localStorage.getItem(AUTH_STORAGE_KEY);
      const saved = localStorage.getItem(USERNAME_STORAGE_KEY);
      const sessionToken = getSessionToken();
      if (isAuth === "true" && saved && sessionToken) {
        tryAutoConnect(saved);
      } else {
        if (isAuth === "true" || saved) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          localStorage.removeItem(USERNAME_STORAGE_KEY);
          persistSessionToken(null);
          clearOidcAuth();
          setShowAuthModal(false);
        }
        tryGuestConnect();
      }
    }

    const timer = window.setTimeout(() => {
      if (!cancelled) {
        initialize();
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ChatLayout />
      <AuthModal />
    </>
  );
}

export default App;
