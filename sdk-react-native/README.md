# @mio/realtime-sdk-react-native

Bindings React Native pour
[`@mio/realtime-sdk`](../sdk-typescript) — réexporte l'intégralité de
[`@mio/realtime-sdk-react`](../sdk-react) (aucun de ses hooks/composants
ne touche le DOM, donc tous fonctionnent tels quels en RN) et remplace
`<RealtimeProvider>` par une version consciente de `AppState`.

> **Statut de validation :** `sdk-react` (dont dépend ce package) compile
> avec succès dans l'environnement où ces deux packages ont été écrits.
> Ce package lui-même dépend de `react-native` pour le typage — voir la
> note d'installation ci-dessous si `npm install`/`npm run build` n'ont
> pas pu être vérifiés de bout en bout ici (paquet volumineux, résolution
> lente). La reconnexion `AppState` suit un pattern RN standard et bien
> connu (reconnecter au retour en `"active"`), mais **non testée dans une
> vraie app RN** — à valider contre un appareil/simulateur réel avant
> usage en production.

## Pourquoi un package séparé plutôt que juste `sdk-react` en React Native

`sdk-react` seul fonctionnerait déjà pour l'essentiel (Context/hooks purs,
aucune API navigateur) — ce package n'ajoute que ce qui est *spécifique*
à React Native et n'a pas de sens ailleurs :

- **Reconnexion `AppState`** (`<RealtimeProvider>` de ce package) : l'OS
  peut suspendre entièrement l'exécution JS en arrière-plan, donc le
  timer de reconnexion à backoff du client core n'a alors plus aucune
  chance de s'exécuter. Ce Provider déconnecte explicitement au passage
  en arrière-plan et reconnecte au retour en premier plan.
- **Reconnexion réseau optionnelle** (`useNetworkReconnect`) : reconnecte
  dès que la connectivité revient, via
  [`@react-native-community/netinfo`](https://github.com/react-native-netinfo/react-native-netinfo)
  — une dépendance peer *optionnelle* (`peerDependenciesMeta`), chargée
  dynamiquement ; son absence rend simplement le hook no-op, elle n'est
  jamais imposée.

Aucune de ces deux préoccupations n'a d'équivalent utile dans un
navigateur (un onglet en arrière-plan garde son JS actif), d'où la
séparation plutôt que de les ajouter directement à `sdk-react`.

## Installation

```bash
npm install @mio/realtime-sdk-react-native @mio/realtime-sdk
# Optionnel — pour useNetworkReconnect :
npm install @react-native-community/netinfo
```

## Démarrage rapide

```tsx
import { RealtimeProvider, useChannel, useNetworkReconnect } from "@mio/realtime-sdk-react-native";

function App() {
  return (
    <RealtimeProvider
      config={{
        wsUrl: monWsUrlEmisParLeServeur, // le `ws_url` de la réponse de mint-token
        tenantId: "12345678-9abc-def0-1122-334455667788",
        token: monJetonEmisParLeServeur,
      }}
    >
      <OrdersFeed />
    </RealtimeProvider>
  );
}

function OrdersFeed() {
  useNetworkReconnect(); // optionnel — no-op si NetInfo n'est pas installé
  const { messages, publish } = useChannel("orders:42", { limit: 100 });
  // ... même API que sdk-react, voir son README pour le détail des hooks
}
```

## API

Tout ce qu'exporte [`@mio/realtime-sdk-react`](../sdk-react) — voir
son README pour `useChannel`, `useSubscription`, `useConnectionState`,
`<ChannelSubscriber>`, etc. — plus, spécifique à ce package :

| Export | Rôle |
|---|---|
| `<RealtimeProvider client\|config>` | Même API que `sdk-react`, avec la reconnexion `AppState` en plus. |
| `useNetworkReconnect()` | À appeler sous un `<RealtimeProvider>` — reconnecte au retour de connectivité réseau. Optionnel, no-op sans NetInfo. |

## Développement

```bash
npm install
npm run build   # compile src/ -> dist/
```
