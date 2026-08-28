# mio Realtime (WordPress)

Extension WordPress connectant un site au moteur de notification et
messagerie temps réel multi-tenant (protocole binaire fixe 256 octets) de
ce dépôt — API volontairement proche des SDKs
[TypeScript](../sdk-typescript), [Python](../sdk-python),
[Rust](../sdk-rust) et [Android](../sdk-android) du même projet : mêmes
opérations, mêmes limitations documentées, adaptées ici aux contraintes
propres à WordPress/PHP.

> **Statut de validation (précis, pas juste rassurant) :**
> - `includes/Client.php` (mint de jeton, publication HTTP) — **réellement
>   testé** : 9/9 tests PHPUnit passants (`composer test`), contre un
>   `HttpTransport` factice, sans dépendre de WordPress (voir la doc de
>   tête de `HttpTransport.php` pour pourquoi c'est possible).
> - `assets/js/mio-protocol.js` (codec du frame binaire) et
>   `assets/js/mio-client.js` (client WebSocket navigateur) — **réellement
>   testés** : 17/17 tests `node --test` passants (`npm test`), y compris
>   un test dédié au découpage UTF-8 sur une frontière de caractère valide
>   (piège classique d'un port naïf).
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
composer test        # 9 tests
npm test              # 17 tests (assets/js/)
```

Puis, dans WordPress : copier ce dossier dans `wp-content/plugins/`,
activer l'extension, et renseigner **Réglages > mio Realtime** (URL de
l'API Portal, tenant ID, secret, host/port WebSocket — tout se trouve dans
le portail tenant de ce projet, `tenant-portal/`, sous Settings > API keys).

## Démarrage rapide

### Côté serveur (PHP) — miner un jeton, publier

```php
use Mio\Realtime\Client;

$client = new Client('https://realtime.example.com:8090', $tenantId, $secret);

$minted = $client->mintToken('user-42'); // -> MintedToken { token, expiresIn }
$client->publish('orders:42', 'commande créée', $minted->token);
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

## Fonctionnalités

| Fonctionnalité | API |
|---|---|
| Mint de jeton (serveur) | `Client::mintToken($sub, $ttlSecs = null)` |
| Publication (serveur, HTTP) | `Client::publish($channelId, $payload, $token)` |
| Jeton pour le navigateur | `GET /wp-json/mio/v1/token` (jamais le secret) |
| Souscription (navigateur) | `client.subscribe(channelId, handler)` (JS, canal exact ou motif `orders:*`) |
| Publication (navigateur) | `client.publish(channelId, payload)` (JS, un seul frame) |
| Rattrapage d'historique | `client.replay(channelId, sinceUnixSeconds)` (JS) |
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
