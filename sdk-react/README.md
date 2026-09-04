# @mio/realtime-sdk-react

Bindings React (contexte, hooks, composants) pour
[`@mio/realtime-sdk`](../sdk-typescript) — le moteur de notification et
messagerie temps réel multi-tenant (protocole binaire fixe 256 octets).
N'ajoute aucune logique protocolaire : c'est une couche fine au-dessus de
`RealtimeClient`, pensée pour éviter le boilerplate `useEffect` +
`subscribe`/`unsubscribe` répété dans chaque composant.

> **Statut de validation :** compilé avec succès (`npm run build`, `tsc`
> strict) dans l'environnement où ce package a été écrit. **Non testé au
> runtime** contre un vrai serveur ni dans une vraie app React — la
> logique des hooks est directe (souscription en effet, désinscription au
> nettoyage) mais un premier essai réel dans `tenant-portal` ou `admin`
> reste recommandé avant usage en production.

## Installation

```bash
npm install @mio/realtime-sdk-react @mio/realtime-sdk
```

## Démarrage rapide

```tsx
import { RealtimeProvider, useChannel } from "@mio/realtime-sdk-react";

function App() {
  return (
    <RealtimeProvider
      config={{
        wsUrl: monWsUrlEmisParLeServeur, // le `ws_url` de la réponse de mint-token, voir README de sdk-typescript
        tenantId: "12345678-9abc-def0-1122-334455667788",
        token: monJetonEmisParLeServeur, // voir README de sdk-typescript
      }}
    >
      <OrdersFeed />
    </RealtimeProvider>
  );
}

function OrdersFeed() {
  const { messages, publish } = useChannel("orders:42", { limit: 100 });

  return (
    <>
      <ul>
        {messages.map((m, i) => (
          <li key={i}>{m.payload}</li>
        ))}
      </ul>
      <button onClick={() => publish("commande créée")}>Publier</button>
    </>
  );
}
```

## API

| Export | Rôle |
|---|---|
| `<RealtimeProvider client\|config>` | Fournit un `RealtimeClient` (et son état de connexion) à tout le sous-arbre — `connect()`/`disconnect()` gérés autour du cycle de vie. |
| `useRealtimeClient()` | Le `RealtimeClient` du Provider englobant, pour un usage direct (`client.replay(...)`, etc.). |
| `useConnectionState()` | `{ connectionState, lastError }` — `connectionState` : `"idle" \| "connecting" \| "open" \| "closed" \| "error"`. |
| `useSubscription(channelId, handler)` | Souscription à effet seul, sans re-render — pour piloter autre chose que du state React. |
| `useChannel(channelId, { limit?, replaySince? })` | Souscription à état : `{ messages, publish, publishTemplate, clear }`, re-render à chaque message. |
| `usePublish(channelId)` | Publication seule, sans souscription. |
| `usePublishTemplate(channelId)` | Publication d'un template sauvegardé du tenant (par id, `{{variable}}` remplies côté serveur) seule, sans souscription — HTTP, fonctionne même sans connexion WS ouverte. Voir « Publish a saved template over HTTP » dans le DOCS.md racine. |
| `<ChannelSubscriber channelId>{state => ...}</ChannelSubscriber>` | Équivalent render-prop de `useChannel`, pour composition JSX ou composants classe. |
| `<ConnectionIndicator labels?>` | Texte d'état de connexion minimal, non stylé — un point de départ, pas un composant themé. |
| `useBackgroundNotifications(options?)` | Affiche une `Notification` navigateur pour chaque message reçu tant que l'onglet est caché/sans focus — voir `attachBackgroundNotifications` côté `sdk-typescript`. |
| `usePushSubscription(serviceWorkerUrl, vapidPublicKey)` | Cycle de vie complet d'un abonnement Web Push, bas niveau (ne poste vers aucun backend) : `{ status, subscription, error, subscribe, unsubscribe, isSupported }`. |
| `useWebPushRegistration(options)` | Comme ci-dessus, mais `subscribe()` inscrit aussi l'abonnement auprès de *ce* backend mio (`apiBaseUrl`/`token`/`tenantId`/`vapidPublicKey`/`channels?`) — un seul appel. |
| `<PushPermissionButton {...options}>` | Le `<button>` "activer les notifications" prêt à l'emploi (stylable via `className`), ou entièrement custom via `children` render-prop — voir la section dédiée plus bas. |

`channelId` accepte `null`/`undefined` partout (`useSubscription`,
`useChannel`) : la souscription reste simplement inactive tant qu'il n'est
pas résolu — pratique quand il dépend d'un état asynchrone (session,
paramètre de route) pas encore disponible.

## Un seul canal actif, deux façons de le consommer

`useSubscription` ne fait **jamais** re-render son propre composant — le
handler est un effet de bord pur. `useChannel` accumule les messages en
state React borné (`limit`, défaut 50) et re-render à chaque message.
Utilisez `useSubscription` pour piloter un `ref`, un graphique impératif,
ou tout ce qui n'a pas besoin d'un re-render React par message ;
`useChannel` pour l'affichage direct (chat, flux, journal).

## Custom "ask permission" UI — `<PushPermissionButton>`

Two ways to use it, same component:

```tsx
import { PushPermissionButton } from '@mio/realtime-sdk-react'

const pushOptions = {
  apiBaseUrl: 'https://mio.example.com',
  token,          // minted server-side, never your tenant secret
  tenantId,
  vapidPublicKey,
  channels: ['orders:*'], // défaut : ['*']
}

// Rapide : votre propre libellé/icône, le <button> de ce composant
<PushPermissionButton {...pushOptions} className="btn btn-primary">
  <BellIcon /> Activer les alertes
</PushPermissionButton>

// Contrôle total : votre propre balisage, vous pilotez subscribe()/unsubscribe()
<PushPermissionButton {...pushOptions}>
  {(state) => (
    <MySwitch
      checked={state.status === 'subscribed'}
      disabled={state.status === 'subscribing' || state.status === 'unsubscribing'}
      onChange={state.status === 'subscribed' ? state.unsubscribe : state.subscribe}
    />
  )}
</PushPermissionButton>
```

`children` en fonction reçoit exactement l'état de `useWebPushRegistration`
(`{ status, subscription, error, subscribe, unsubscribe, isSupported }`) —
consommez ce hook directement si vous ne voulez aucun élément rendu du
tout (juste l'état, câblé à votre propre UI ailleurs dans l'arbre).

## `client` vs `config`

`<RealtimeProvider client={monClient}>` accepte un `RealtimeClient` déjà
construit — vous en gardez la propriété, ce Provider ne le détruit jamais
au démontage (utile en React Strict Mode, ou entre écrans en React
Native). `<RealtimeProvider config={{ ... }}>` construit et **possède**
le client : celui-ci est déconnecté au démontage. Exactement l'un des
deux doit être fourni.

## Ce que ce package ne fait pas

Pas de génération de jeton (toujours côté serveur — voir le README de
[`sdk-typescript`](../sdk-typescript)), pas de UI stylée au-delà de
`<ConnectionIndicator>`/`<PushPermissionButton>` (volontairement minimal,
sans dépendance à un design system — voir la section dédiée ci-dessus pour
comment leur passer votre propre balisage), pas de persistance des
messages au-delà du buffer en mémoire de `useChannel`. Pour React Native
spécifiquement (reconnexion `AppState`/réseau), voir
[`@mio/realtime-sdk-react-native`](../sdk-react-native), qui réexporte
tout ce package **sauf** `useBackgroundNotifications`/`usePushSubscription`/
`useWebPushRegistration`/`<PushPermissionButton>` —
ils enveloppent les API navigateur `Notification`/`ServiceWorker`/
`PushManager`, qui n'existent pas en React Native (notifications natives
RN : un mécanisme entièrement différent, FCM/APNs via une lib comme
`@react-native-firebase/messaging`, hors du périmètre de ce SDK).

## Développement

```bash
npm install
npm run build   # compile src/ -> dist/
```
