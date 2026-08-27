# syntax=docker/dockerfile:1.7

# =============================================================================
# STAGE 1 — builder : compile un binaire 100% statique pour x86_64-musl.
#
# On part de l'image officielle musl (et non de rust:slim + apt install
# musl-tools) pour garder un environnement de build reproductible et léger
# à cacher. reqwest est configuré (Cargo.toml) sur rustls-tls plutôt que
# openssl : ça évite tout le pain de la liaison statique d'OpenSSL contre
# musl, qui est la source n°1 d'échecs de build sur ce genre d'image.
# =============================================================================
FROM --platform=$BUILDPLATFORM messense/rust-musl-cross:x86_64-musl AS builder

WORKDIR /build

# --- Étape de cache des dépendances ---
# On copie d'abord uniquement les manifestes pour que `cargo build` des
# dépendances soit mis en cache par Docker tant que Cargo.toml/lock ne
# changent pas, indépendamment des modifications du code source.
COPY Cargo.toml Cargo.lock* ./

# Crée un src/main.rs factice pour permettre à `cargo build` de résoudre
# et compiler uniquement les dépendances lors de ce layer.
RUN mkdir -p src \
    && echo "fn main() {}" > src/main.rs \
    && cargo build --release --target x86_64-unknown-linux-musl \
    && rm -rf src

# --- Étape de build réel ---
COPY src ./src
# Requis par la macro `sqlx::migrate!("./migrations")` dans main.rs, qui lit
# ce dossier au moment de la compilation (pas à l'exécution).
COPY migrations ./migrations

# On force la reconstruction du binaire du projet (les dépendances déjà
# compilées ci-dessus restent en cache) en invalidant son timestamp.
RUN touch src/main.rs \
    && cargo build --release --target x86_64-unknown-linux-musl \
    && strip target/x86_64-unknown-linux-musl/release/realtime-engine

# Empty directory, correctly owned at copy time — see its `COPY --chown`
# use in the runtime stage below.
RUN mkdir -p /data

# =============================================================================
# STAGE 2 — image finale : `scratch` (0 octet de base), binaire statique
# musl uniquement. Pas de shell, pas de libc dynamique, pas de package
# manager : surface d'attaque minimale et image < 20 Mo (contrainte #5).
# =============================================================================
FROM scratch AS runtime

# Certificats CA nécessaires pour les appels HTTPS sortants vers FCM
# (contrainte #4). `scratch` n'a rien : on les copie depuis le builder.
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

COPY --from=builder /build/target/x86_64-unknown-linux-musl/release/realtime-engine /realtime-engine

# Pre-created, correctly-owned mount point for `PORTAL_DB_PATH`'s SQLite
# file. `scratch` has no shell to `chown` at runtime, and a fresh named
# volume mounted over `/data` is normally created root-owned — Docker
# initializes a brand-new volume from whatever already exists in the image
# at that path, ownership included, so creating it here (in the builder
# stage, which has a shell) and copying it in with `--chown` is what makes
# `/data` actually writable by the non-root user below.
COPY --from=builder --chown=65532:65532 /data /data

# Ports exposés : socket temps réel (TCP/WebSocket) et Admin API interne.
# Le port 9090 (Admin API) ne doit être publié (`-p`/`ports:`) que sur un
# réseau interne/VPN — ne jamais l'exposer publiquement en production.
#
# Variables d'environnement principales (voir main.rs) :
#   DEMO_TENANT_SECRET  secret du tenant de démonstration (optionnel)
#   ADMIN_API_TOKEN     jeton Bearer requis par l'Admin API (fortement recommandé en prod)
#   FCM_PROJECT_ID / FCM_BEARER_TOKEN   config du fallback push FCM
#   REDIS_URL            ex: redis://service-cache:6379 — active le broadcast
#                         multi-instances (roadmap "Horizontal Scaling") ;
#                         absent = mode single-instance, sans dépendance Redis
#
# Endpoint de scraping Prometheus : GET http://<host>:9090/metrics
# (même restriction d'exposition que le reste de l'Admin API : réseau
# interne uniquement).
EXPOSE 7878 8080 9090 8090

# `scratch` n'a pas d'utilitaire pour créer un utilisateur non-root ; on
# fixe donc un UID numérique arbitraire non privilégié directement — aucun
# fichier /etc/passwd n'est nécessaire pour que cela fonctionne avec un
# runtime OCI moderne (Docker/containerd/Kubernetes).
USER 65532:65532

ENTRYPOINT ["/realtime-engine"]

# -----------------------------------------------------------------------------
# Variante alternative (décommenter si `scratch` pose problème avec vos
# outils d'observabilité qui ont besoin d'un shell pour un healthcheck
# `docker exec`) : remplacer le FROM ci-dessus par `alpine:3.20` et ajouter
#
#   RUN apk add --no-cache ca-certificates && adduser -D -u 65532 app
#   USER app
#
# Alpine ajoute ~7 Mo mais reste largement sous la barre des 20 Mo tout en
# offrant un shell pour le debug/exec en cas de besoin.
# -----------------------------------------------------------------------------
