/**
 * `RealtimeContext.tsx` — Contexte React portant un `RealtimeClient` unique
 * pour tout un sous-arbre de composants, avec son état de connexion.
 *
 * On expose ici `RealtimeClient` (la classe concrète du moteur maison,
 * cf. `sdk-typescript/src/client.ts`) plutôt que l'interface abstraite
 * `RealtimeAdapter` : `RealtimeAdapter` ne porte aucune notion
 * d'évènements (`on()`), qui est pourtant ce dont ce Provider a besoin
 * pour dériver `connectionState`. Un `RealtimeAdapter` alternatif
 * (Firebase/PubNub) resterait utilisable directement via `useRealtimeClient`
 * mais sans le suivi de connexion — cf. le README pour ce compromis assumé.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { RealtimeClient, type RealtimeClientConfig } from "@mio/realtime-sdk";

export type ConnectionState = "idle" | "connecting" | "open" | "closed" | "error";

export interface RealtimeContextValue {
  client: RealtimeClient;
  connectionState: ConnectionState;
  lastError: Error | null;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export interface RealtimeProviderProps {
  /**
   * Un client déjà construit — vous en gardez la propriété : ce Provider
   * appelle quand même `connect()`/`disconnect()` autour de son cycle de
   * vie (sauf `autoConnect={false}`), mais ne le recrée jamais et ne le
   * détruit jamais lui-même au démontage (utile si vous le réutilisez
   * entre remounts, ex. React Strict Mode, navigation d'écran RN).
   */
  client?: RealtimeClient;
  /**
   * Configuration à partir de laquelle ce Provider construit et possède
   * un `RealtimeClient` — dans ce cas, il appelle bien `disconnect()` au
   * démontage. Mutuellement exclusif avec `client` (exactement l'un des
   * deux doit être fourni).
   */
  config?: RealtimeClientConfig;
  /** Appelle `client.connect()` automatiquement au montage. Défaut : true. */
  autoConnect?: boolean;
  children: ReactNode;
}

export function RealtimeProvider({
  client: clientProp,
  config,
  autoConnect = true,
  children,
}: RealtimeProviderProps) {
  const client = useMemo(() => {
    if (clientProp) return clientProp;
    if (!config) {
      throw new Error("RealtimeProvider requiert soit `client`, soit `config`.");
    }
    return new RealtimeClient(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientProp, config]);

  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [lastError, setLastError] = useState<Error | null>(null);

  useEffect(() => {
    const offOpen = client.on("open", () => setConnectionState("open"));
    // Optimiste comme `RealtimeClient` lui-même (pas d'ACK AUTH protocolaire,
    // cf. sa doc) — `authenticated` suit toujours `open`, donc n'apporte
    // rien de plus ici, mais on l'observe pour rester complet si `open`
    // finit un jour par précéder une phase d'auth asynchrone réelle.
    const offAuthenticated = client.on("authenticated", () => setConnectionState("open"));
    const offClose = client.on("close", () => setConnectionState("closed"));
    const offError = client.on("error", (err) => {
      setLastError(err);
      setConnectionState("error");
    });

    if (autoConnect) {
      setConnectionState("connecting");
      client.connect();
    }

    return () => {
      offOpen();
      offAuthenticated();
      offClose();
      offError();
      if (!clientProp) client.disconnect();
    };
  }, [client, autoConnect, clientProp]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ client, connectionState, lastError }),
    [client, connectionState, lastError],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** Accès bas niveau au contexte complet — la plupart du code applicatif
 * devrait plutôt utiliser `useRealtimeClient`/`useConnectionState`. */
export function useRealtimeContext(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtimeContext doit être appelé sous un <RealtimeProvider>.");
  }
  return ctx;
}
