/**
 * `event-emitter.ts` — Émetteur d'évènements typé minimal.
 *
 * Volontairement réimplémenté plutôt que d'utiliser `events` de Node.js,
 * pour que le SDK reste isomorphe navigateur/Node/React Native sans
 * polyfill supplémentaire.
 */

type Listener<T> = (payload: T) => void;

export class TypedEmitter<Events extends Record<string, unknown>> {
  private readonly listeners: {
    [K in keyof Events]?: Set<Listener<Events[K]>>;
  } = {};

  /** S'abonne à `event`. Retourne une fonction de désinscription. */
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners[event];
    if (!set) {
      set = new Set();
      this.listeners[event] = set;
    }
    set.add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  protected emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    // Copie défensive en tableau : un listener qui se désabonne pendant
    // son propre appel (`off` dans le callback) ne doit pas perturber
    // l'itération en cours sur le `Set` d'origine.
    const set = this.listeners[event];
    if (!set) return;
    for (const listener of Array.from(set)) {
      listener(payload);
    }
  }
}
