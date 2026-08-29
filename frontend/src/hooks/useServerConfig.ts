import { useEffect, useState } from "react";
import { chatAPI, type ServerConfig } from "@/lib/api";

let cached: ServerConfig | null = null;
let inflight: Promise<ServerConfig | null> | null = null;
const listeners = new Set<(cfg: ServerConfig | null) => void>();

function loadServerConfig(): void {
  if (cached || inflight) return;
  try {
    inflight = chatAPI
      .fetchServerConfig()
      .then((cfg) => {
        cached = cfg;
        listeners.forEach((fn) => fn(cfg));
        return cfg;
      })
      .finally(() => {
        inflight = null;
      });
  } catch {
    // Older backends (or unit-test mocks) may not implement the endpoint.
    inflight = null;
  }
}

/**
 * Shared accessor for the backend's public config (/api/config).
 * The backend is the single source of truth for bot name and model; this hook
 * caches the response process-wide so every surface shows the same truth.
 */
export function useServerConfig(): ServerConfig | null {
  const [config, setConfig] = useState<ServerConfig | null>(cached);

  useEffect(() => {
    const listener = (cfg: ServerConfig | null) => setConfig(cfg);
    listeners.add(listener);
    if (!cached) loadServerConfig();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return config;
}
