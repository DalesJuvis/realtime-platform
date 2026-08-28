/**
 * `RealtimeProvider.tsx` — Enveloppe le `RealtimeProvider` de
 * `@mio/realtime-sdk-react` avec une reconnexion consciente de
 * `AppState`.
 *
 * Nécessaire spécifiquement en React Native (contrairement à un onglet
 * navigateur) : l'OS peut suspendre entièrement l'exécution JS en arrière-
 * plan, donc le timer de reconnexion à backoff du client core
 * (`sdk-typescript/src/client.ts::scheduleReconnect`) n'a alors plus
 * aucune chance de s'exécuter — il n'y a plus de timer qui tourne pour
 * reprendre. Au passage en arrière-plan, on déconnecte donc explicitement
 * (`closedByUser = true` côté client, cf. `disconnect()`) plutôt que de
 * laisser l'OS couper la socket sous le pied du client, pour que celui-ci
 * ne consomme pas son budget de backoff sur des tentatives faites sans
 * JS de premier plan pour les recevoir ; au retour en premier plan, on
 * appelle `connect()` nous-mêmes.
 */

import { useEffect, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  RealtimeProvider as BaseRealtimeProvider,
  useRealtimeClient,
  type RealtimeProviderProps,
} from "@mio/realtime-sdk-react";

function AppStateReconnector({ children }: { children: ReactNode }) {
  const client = useRealtimeClient();

  useEffect(() => {
    let appState: AppStateStatus = AppState.currentState;

    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground = /inactive|background/.test(appState);
      const isBackground = /inactive|background/.test(nextState);

      if (wasBackground && nextState === "active") {
        client.connect();
      } else if (!wasBackground && isBackground) {
        client.disconnect();
      }

      appState = nextState;
    });

    return () => subscription.remove();
  }, [client]);

  return <>{children}</>;
}

/**
 * Remplace le `RealtimeProvider` de `@mio/realtime-sdk-react` dans une
 * app React Native — même API (`client`/`config`/`autoConnect`), plus la
 * reconnexion `AppState` ci-dessus. Pour la reconnexion réseau (retour de
 * connectivité), voir `useNetworkReconnect` séparément — optionnelle,
 * nécessite `@react-native-community/netinfo`.
 */
export function RealtimeProvider(props: RealtimeProviderProps) {
  return (
    <BaseRealtimeProvider {...props}>
      <AppStateReconnector>{props.children}</AppStateReconnector>
    </BaseRealtimeProvider>
  );
}
