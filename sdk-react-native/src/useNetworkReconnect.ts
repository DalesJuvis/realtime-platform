/**
 * `useNetworkReconnect.ts` — Reconnexion au retour de connectivité réseau.
 *
 * Optionnel et séparé de `RealtimeProvider` : nécessite
 * `@react-native-community/netinfo`, une dépendance peer *optionnelle*
 * (`peerDependenciesMeta`, cf. `package.json`) — toutes les apps RN ne
 * l'installent pas, et ce SDK ne doit pas le leur imposer. L'import est
 * dynamique et son échec silencieusement absorbé (le hook devient un
 * no-op) plutôt que de faire planter l'app d'un consommateur qui ne l'a
 * pas installé — même esprit que le chargement dynamique optionnel de
 * `ws` côté `sdk-typescript` pour Node.js (cf. sa doc dans `client.ts`).
 *
 * Le typage exact du module n'est volontairement pas résolu ici (pas de
 * `.d.ts` d'ambiance bundlé pour lui) : un shim publié dans ce package
 * risquerait d'entrer en collision avec les vrais types de NetInfo chez
 * un consommateur qui l'a réellement installé. `@ts-ignore` ci-dessous ne
 * supprime que l'erreur de résolution de module à la compilation de *ce*
 * package (où NetInfo n'est jamais installé) ; à l'exécution, seule la
 * forme réellement utilisée (`addEventListener`) compte.
 */

import { useEffect } from "react";
import { useRealtimeClient } from "@yourorg/realtime-sdk-react";

interface NetInfoState {
  isConnected: boolean | null;
}

interface NetInfoModule {
  addEventListener(listener: (state: NetInfoState) => void): () => void;
}

/** Appelez ce hook sous un `<RealtimeProvider>` (de ce package ou de
 * `@yourorg/realtime-sdk-react`) pour reconnecter dès que la connectivité
 * réseau revient après une coupure. */
export function useNetworkReconnect(): void {
  const client = useRealtimeClient();

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      let NetInfo: NetInfoModule;
      try {
        // @ts-ignore — dépendance peer optionnelle, jamais installée dans ce package lui-même.
        const mod = (await import("@react-native-community/netinfo")) as { default: NetInfoModule };
        NetInfo = mod.default;
      } catch {
        return; // non installé — no-op silencieux, voir doc de tête.
      }
      if (cancelled) return;

      let wasConnected = true;
      unsubscribe = NetInfo.addEventListener((state) => {
        const isConnected = Boolean(state.isConnected);
        if (isConnected && !wasConnected) client.connect();
        wasConnected = isConnected;
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [client]);
}
