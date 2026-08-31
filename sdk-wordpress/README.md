# mio Realtime (WordPress)

Extension WordPress connectant un site au moteur de notification et
messagerie temps réel multi-tenant (protocole binaire fixe 256 octets) de
ce dépôt — API volontairement proche des SDKs
[TypeScript](../sdk-typescript), [Python](../sdk-python),
[Rust](../sdk-rust) et [Android](../sdk-android) du même projet : mêmes
opérations, mêmes limitations documentées, adaptées ici aux contraintes
propres à WordPress/PHP. `includes/Client.php` est aussi la base de
[sdk-laravel](../sdk-laravel) — même classe, framework-independent, un
transport HTTP différent en dessous (voir "Pourquoi pas..." plus bas).

> **Statut de validation (précis, pas juste rassurant) :**
> - `includes/Client.php` (mint de jeton, publication HTTP, évènements
>   nommés) — **réellement testé** : 12/12 tests PHPUnit passants
>   (`composer test`), contre un `HttpTransport` factice, sans dépendre de
>   WordPress (voir la doc de tête de `HttpTransport.php` pour pourquoi
>   c'est possible).
> - `assets/js/mio-protocol.js` (codec du frame binaire), `mio-client.js`
>   (client WebSocket navigateur) et `mio-embed.js` (même logique,
>   consolidée en un seul fichier — voir plus bas) — **réellement
>   testés** : 44/44 tests `node --test` passants (`npm test`), y compris
>   un test dédié au découpage UTF-8 sur une frontière de caractère valide
>   (piège classique d'un port naïf), la race `connect()`/`publish()`/
>   `replay()` corrigée en 0.1.3-0.1.4, `showBackgroundNotification()`/
>   `attachBackgroundNotifications()`, et un test garantissant que
>   `mio-embed.js` reste une copie fidèle du reste (mêmes cas, deux
>   fichiers).
> - `includes/RestController.php`, `Shortcode.php`, `AdminPage.php`
>   (l'intégration WordPress proprement dite : routes REST, shortcode,
>   page de réglages) — **non testées au runtime**, faute d'installation
>   WordPress + MySQL disponible dans l'environnement où cette extension a
>   été écrite. Le code suit les API WordPress standard
>   (`register_rest_route`, `add_shortcode`, Settings API) sans rien
>   d'exotique, mais un premier test réel sur un WordPress installé reste
>   nécessaire avant usage en production.
> - `assets/js/mio-shortcode.js` (câblage DOM du widget) — non testé
>   (nécessiterait un navigateur réel ou jsdom), mais court et simple :
>   fetch du jeton, construction du client, abonnement, rendu.

## Pourquoi pas un client WebSocket persistant côté PHP

Les autres SDKs de ce projet (TypeScript, Python, Rust, Android/Kotlin)
maintiennent tous une connexion WebSocket ouverte en continu, dans un
processus long-vivant. PHP sous WordPress n'a normalement pas ce
processus long-vivant : chaque requête HTTP démarre et termine PHP
(mod_php/PHP-FPM) — il n'y a nulle part où garder une socket ouverte entre
deux requêtes sans sortir du modèle d'hébergement WordPress standard
(ReactPHP/Swoole, hors-scope ici).

`includes/Client.php` s'en tient donc à ce que PHP fait bien : deux appels
HTTP (`mintToken()`, `publish()`), typiquement depuis un hook WordPress
(`save_post`, une action Woo Commerce, un cron). Pour de la réception en
temps réel, c'est `assets/js/mio-client.js` — dans le navigateur du
visiteur, où une connexion persistante a un sens — qui fait le travail,
via le shortcode `[mio_realtime]`.

## Installation

```bash
composer install    # includes/ + tests/php (phpunit en dev uniquement)
composer test        # 12 tests
npm test              # 44 tests (assets/js/)
npm run build          # produit assets/js/*.min.js (terser) — voir scripts/minify.js
```

Puis, dans WordPress : copier ce dossier dans `wp-content/plugins/`,
activer l'extension, et renseigner **Réglages > mio Realtime** (URL de
l'API Portal, tenant ID, secret — tout se trouve dans le portail tenant de
ce projet, `tenant-portal/`, sous Settings > API keys). Il n'y a plus de
réglage "host/port WebSocket" à renseigner : l'URL WebSocket vient
directement du `ws_url` renvoyé par le serveur à chaque mint de jeton, et
n'est plus jamais assemblée à la main côté extension.

## Démarrage rapide

### Côté serveur (PHP) — miner un jeton, publier

```php
use Mio\Realtime\Client;

$client = new Client('https://realtime.example.com:8090', $tenantId, $secret);

$minted = $client->mintToken('user-42'); // -> MintedToken { token, expiresIn, wsUrl }
$client->publish('orders:42', 'commande créée', $minted->token);

// Évènement nommé, même enveloppe JSON que côté navigateur (voir plus bas) :
$client->emitEvent('orders:42', 'order.created', $minted->token, ['orderId' => 123]);
```

Ne jamais renvoyer `$secret` au navigateur — seul `$minted->token` doit en
sortir (voir `RestController`, qui fait exactement ça).

### Côté site — le shortcode

```
[mio_realtime channel="orders:42" limit="20" replay="true"]
```

Rend un flux live minimal (liste de messages, mis à jour en direct) —
point de départ fonctionnel, pas un composant themé (même logique que
`sdk-react`'s `<ConnectionIndicator>` : un vrai début, pas une UI finie).

## Sans installer l'extension — `mio-embed.js`

Pas d'accès à `wp-content/plugins/`, ou juste besoin d'un flux sur une
seule page ? `assets/js/mio-embed.js` est `mio-protocol.js` +
`mio-client.js` consolidés en **un seul fichier**, sans dépendance, à
coller directement dans WordPress (bloc HTML personnalisé, zone
"Insérer en-tête et pied de page" du thème, `footer.php`) — aucun PHP,
aucune étape de build.

Aucun hébergement à mettre en place — ce dépôt est public, donc
[jsDelivr](https://www.jsdelivr.com/documentation#id-github) sert le
fichier directement depuis une release taguée, en cache mondial ; utilisez
la version `.min.js` (build committé, `npm run build`), pas la source
brute :

```html
<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.6/sdk-wordpress/assets/js/mio-embed.min.js"
  data-ws-url="wss://mio.gabonnettoyage.online/ws"
  data-tenant-id="12345678-9abc-def0-1122-334455667788"
  data-token="…"
  data-channel="orders:42"
  data-limit="20"
  data-replay="true"
></script>
<div id="my-feed"></div> <!-- optionnel : sans data-target, une div est créée automatiquement -->
```

`data-ws-url` est le `ws_url` renvoyé par `mintToken()`/`/api/v1/auth/tokens`
— à reporter tel quel, jamais reconstruit depuis un host/port séparé.

Auto-hébergement (`https://votre-site.example/mio-embed.js`) reste une
option si vous préférez ne pas dépendre de jsDelivr — même fichier,
même usage :

```html
<script src="https://votre-site.example/mio-embed.js"
  data-ws-url="wss://mio.gabonnettoyage.online/ws"
  data-tenant-id="12345678-9abc-def0-1122-334455667788"
  data-token="…"
  data-channel="orders:42"
  data-limit="20"
  data-replay="true"
></script>
<div id="my-feed"></div> <!-- optionnel : sans data-target, une div est créée automatiquement -->
```

**Un script exécuté dans le navigateur d'un visiteur ne peut jamais
détenir votre secret tenant en sécurité** — n'importe qui peut voir le
code source de la page. `mio-embed.js` n'accepte donc qu'un jeton *déjà
miné* (`data-token`) : jamais le secret. Ce jeton reste visible dans le
code source une fois sur la page — c'est le compromis honnête d'un embed
sans backend, pas un bug : exactement comme une clé API publique ou une
clé publiable Stripe. Minez-en un avec un `sub` à faible privilège
(`"public-embed"`, pas un vrai utilisateur) et un TTL que vous êtes prêt à
faire tourner (`Client::mintToken($sub, $ttlSecs)` côté PHP, ou
`POST /api/v1/auth/tokens` directement — voir le README de
`sdk-typescript`), puis renouvelez-le sur ce rythme.

Omettre `data-token`/`data-channel` charge juste `window.MioEmbedClient`
(le constructeur) sans rendu automatique, pour qui préfère construire sa
propre UI.

### Notifications en arrière-plan — onglet ouvert, caché ou sans focus

`mio-client.js` et `mio-embed.js` exposent tous deux
`isNotificationSupported()`, `requestNotificationPermission()`,
`showBackgroundNotification(message, options?)` et
`attachBackgroundNotifications(client, options?)` — l'API `Notification`
native du navigateur uniquement, aucune infrastructure serveur (pas de
Service Worker, pas de clé VAPID), même logique que `@mio/realtime-sdk`'s
équivalents (voir son README). Fonctionne dès aujourd'hui : le message
arrive déjà sur la connexion WS ouverte, ceci décide juste s'il faut
aussi l'afficher comme notification système pendant que l'onglet est
caché ou sans focus.

Deux façons de s'en servir — **directement dans un callback `subscribe()`**
(contrôle total, canal par canal) :

```html
<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.6/sdk-wordpress/assets/js/mio-protocol.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.6/sdk-wordpress/assets/js/mio-client.min.js"></script>
<script>
  var client = new window.MioRealtimeClient({ wsUrl: '…', tenantId: '…', token: '…' })

  // Sur un clic utilisateur — jamais au chargement de la page :
  document.getElementById('enable-notifs').addEventListener('click', function () {
    window.MioRealtimeClient.requestNotificationPermission()
  })

  client.subscribe('orders:42', function (message) {
    window.MioRealtimeClient.showBackgroundNotification(message, {
      title: function (m) { return 'Nouveau sur ' + m.channelId },
      onClick: function (m) { console.log('cliqué :', m.payload) },
    })
    // ... votre propre logique (rendu, etc.)
  })
  client.connect()
</script>
```

...ou **une seule fois pour tous les canaux souscrits**, via
`attachBackgroundNotifications` (mêmes `options`, s'abonne à l'évènement
`'message'` du client lui-même plutôt qu'à un canal précis) :

```js
window.MioRealtimeClient.attachBackgroundNotifications(client, {
  title: function (m) { return 'Nouveau sur ' + m.channelId },
})
```

`window.MioEmbedClient` (le fichier consolidé) expose la même API.
**Ne demande jamais la permission elle-même** — appelez
`requestNotificationPermission()` sur un vrai clic utilisateur, sinon la
plupart des navigateurs l'ignorent silencieusement ; sans permission
accordée, ni l'une ni l'autre ne fait quoi que ce soit plutôt que
d'échouer. Pour des notifications qui fonctionnent aussi onglet/
navigateur fermé, il faut du vrai Web Push (Service Worker + clés VAPID +
`POST /api/v1/push/subscriptions`) — hors de portée de ce fichier
volontairement minimal, voir `registerPushServiceWorker`/`subscribeToPush`
dans le README de `sdk-typescript`.

## Fonctionnalités

| Fonctionnalité | API |
|---|---|
| Mint de jeton (serveur) | `Client::mintToken($sub, $ttlSecs = null)` |
| Publication (serveur, HTTP) | `Client::publish($channelId, $payload, $token)` |
| Évènement nommé (serveur, HTTP) | `Client::emitEvent($channelId, $event, $token, $data = null)` — même enveloppe JSON que `sdk-typescript`'s `client.channel(id).on()` |
| Jeton pour le navigateur | `GET /wp-json/mio/v1/token` (jamais le secret) |
| Souscription (navigateur) | `client.subscribe(channelId, handler)` (JS, canal exact ou motif `orders:*`) |
| Publication (navigateur) | `client.publish(channelId, payload)` (JS, un seul frame) |
| Rattrapage d'historique | `client.replay(channelId, sinceUnixSeconds)` (JS) |
| Notifications en arrière-plan | `MioRealtimeClient.showBackgroundNotification(message, options?)` (JS, canal par canal) ou `.attachBackgroundNotifications(client, options?)` (tous canaux) — onglet caché/sans focus, aucun serveur |
| Widget prêt à l'emploi | `[mio_realtime channel="..."]` |

## Limitations connues (documentées, pas cachées)

- **`Client::publish()` ne chunk pas** — hérité de l'endpoint HTTP
  `/api/v1/messages` lui-même (voir le README de `sdk-typescript`) :
  `payload` > 211 octets UTF-8 lève `ClientException` côté PHP avant tout
  appel réseau. `assets/js/mio-client.js`'s `publish()` applique la même
  limite côté navigateur.
- **`assets/js/mio-client.js` n'est pas `sdk-typescript`** — pas
  d'UNICAST, pas de chunking, pas de multiplexage avancé. Choix
  délibéré : rester un fichier `<script>` sans dépendance ni étape de
  build, adapté à un usage WordPress typique. Pour davantage, bundlez
  `@mio/realtime-sdk` vous-même dans un thème/plugin avec son propre
  pipeline JS.
- **La route REST `/wp-json/mio/v1/token` est publique** (pas
  d'authentification WordPress) — un choix assumé : le widget doit
  fonctionner pour un visiteur anonyme lisant un canal public, exactement
  comme ce canal n'a pas de contrôle d'accès par visiteur côté backend.
  `ttl_secs` y est fixé en dur (3600s) plutôt qu'accepté depuis la
  requête, précisément parce que cette route n'a pas d'authentification.
- **Pas de nettoyage automatique de jetons/sessions** — chaque appel à la
  route REST mine un nouveau jeton (le backend ne fait pas de cache de
  jeton côté serveur ; à ajouter si le volume de visiteurs le justifie).

## Développement

```bash
composer install && composer test
npm test
```
