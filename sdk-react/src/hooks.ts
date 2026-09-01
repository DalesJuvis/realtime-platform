/**
 * `hooks.ts` — Hooks applicatifs construits sur `RealtimeContext`.
 *
 * Deux façons de consommer un canal, pour deux besoins différents :
 * `useSubscription` ne fait jamais re-render son propre composant (le
 * handler est un simple effet de bord — utile pour piloter autre chose
 * que du state React : un `ref`, un graphique impératif, un canal
 * WebRTC) ; `useChannel` accumule les messages en state React borné et
 * re-render à chaque nouveau message — le cas courant (chat, flux,
 * journal d'activité).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageHandler, RealtimeMessage } from "@mio/realtime-sdk";
import { useRealtimeContext, type ConnectionState } from "./RealtimeContext.js";

/** Le `RealtimeClient` du `<RealtimeProvider>` englobant. */
export function useRealtimeClient() {
  return useRealtimeContext().client;
}

/** État de connexion dérivé des évènements du client — voir `ConnectionState`. */
export function useConnectionState(): { connectionState: ConnectionState; lastError: Error | null } {
  const { connectionState, lastError } = useRealtimeContext();
  return { connectionState, lastError };
}

/**
 * Souscription à effet seul : `handler` est rappelé à chaque message reçu
 * sur `channelId`, sans provoquer de re-render de ce composant. `handler`
 * n'a pas besoin d'être stable entre renders (mémoïsé via une ref
 * interne) — seul un changement de `channelId` (ou de client) résilie et
 * recrée la souscription. `channelId` nullish désactive la souscription
 * (pratique tant qu'un ID dépendant d'un état async, ex. une session,
 * n'est pas encore disponible).
 */
export function useSubscription(channelId: string | null | undefined, handler: MessageHandler): void {
  const { client } = useRealtimeContext();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!channelId) return;
    return client.subscribe(channelId, (message) => handlerRef.current(message));
  }, [client, channelId]);
}

export interface UseChannelOptions {
  /** Nombre maximal de messages conservés dans le buffer retourné — les
   * plus anciens sont évincés en premier. Défaut : 50. */
  limit?: number;
  /** Si fourni, demande le rattrapage d'historique (`client.replay()`)
   * depuis ce timestamp (secondes unix) à chaque (ré)souscription — les
   * frames de rattrapage arrivent dans le même flux que les messages
   * live, indistinguables (cf. doc de `replay()` côté SDK core). Omis :
   * pas de rattrapage, uniquement les messages live. */
  replaySince?: number;
}

export interface UseChannelResult {
  /** Messages reçus depuis le montage / le dernier changement de
   * `channelId`, du plus ancien au plus récent, bornés à `limit`. */
  messages: RealtimeMessage[];
  /** Publie sur `channelId`. Lève une erreur si `channelId` est nullish. */
  publish: (payload: string) => void;
  /**
   * Publie un template sauvegardé du tenant (tenant-portal → Templates)
   * sur `channelId`, `{{variable}}` remplies côté serveur — voir
   * `RealtimeClient.publishTemplate`. Passe par HTTP, pas le frame binaire
   * du socket, donc fonctionne même sans connexion WS ouverte. Lève une
   * erreur si `channelId` est nullish.
   */
  publishTemplate: (templateId: string, variables?: Record<string, string>) => Promise<void>;
  /** Vide le buffer local sans se désabonner. */
  clear: () => void;
}

/**
 * Souscription à état : accumule les messages de `channelId` en state
 * React (re-render à chaque message) et expose `publish`/`clear` en plus.
 * Se désabonne et vide le buffer à chaque changement de `channelId`, et
 * au démontage. `channelId` nullish désactive la souscription — le
 * buffer reste alors vide et `publish` lève si appelé.
 */
export function useChannel(
  channelId: string | null | undefined,
  options: UseChannelOptions = {},
): UseChannelResult {
  const { client } = useRealtimeContext();
  const { limit = 50, replaySince } = options;
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);

  useEffect(() => {
    setMessages([]);
    if (!channelId) return;

    const unsubscribe = client.subscribe(channelId, (message) => {
      setMessages((prev) => {
        const next = [...prev, message];
        return next.length > limit ? next.slice(next.length - limit) : next;
      });
    });

    if (replaySince !== undefined) client.replay(channelId, replaySince);

    return unsubscribe;
  }, [client, channelId, limit, replaySince]);

  const publish = useCallback(
    (payload: string) => {
      if (!channelId) {
        throw new Error("useChannel: impossible de publier sans `channelId`.");
      }
      client.publish(channelId, payload);
    },
    [client, channelId],
  );

  const publishTemplate = useCallback(
    (templateId: string, variables?: Record<string, string>) => {
      if (!channelId) {
        throw new Error("useChannel: impossible de publier un template sans `channelId`.");
      }
      return client.publishTemplate(channelId, templateId, variables);
    },
    [client, channelId],
  );

  const clear = useCallback(() => setMessages([]), []);

  return { messages, publish, publishTemplate, clear };
}

/**
 * Publication seule, sans souscription — pour un composant qui n'a besoin
 * que d'envoyer (ex. un composeur de message) sans afficher le flux reçu.
 */
export function usePublish(channelId: string): (payload: string) => void {
  const { client } = useRealtimeContext();
  return useCallback((payload: string) => client.publish(channelId, payload), [client, channelId]);
}

/**
 * Publication de template seule, sans souscription — équivalent de
 * `usePublish` pour `RealtimeClient.publishTemplate` : envoie un template
 * sauvegardé du tenant (tenant-portal → Templates) par id, `{{variable}}`
 * remplies côté serveur, sans jamais avoir besoin du texte du template.
 * Passe par HTTP, pas le frame binaire du socket, donc fonctionne même
 * sans connexion WS ouverte tant qu'un jeton est disponible.
 */
export function usePublishTemplate(
  channelId: string,
): (templateId: string, variables?: Record<string, string>) => Promise<void> {
  const { client } = useRealtimeContext();
  return useCallback(
    (templateId: string, variables?: Record<string, string>) =>
      client.publishTemplate(channelId, templateId, variables),
    [client, channelId],
  );
}
