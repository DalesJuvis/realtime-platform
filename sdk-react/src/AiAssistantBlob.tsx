/**
 * `AiAssistantBlob.tsx` — A friendly floating assistant widget, exportable
 * on its own for any React app (no dependency on react-router, Tailwind,
 * or this monorepo's tenant-portal — see its CTA as `href`/`onClick`
 * rather than a router `<Link>`, and inline styles rather than utility
 * classes, same convention as `PushPermissionPopup`).
 *
 * Deliberately presentation-only: it does not fetch anything or decide
 * what to recommend — the host app computes its own `recommendation`
 * (from whatever data source makes sense there) and passes it in. That
 * keeps this component reusable outside a codebase that happens to have
 * this platform's portal endpoints, and keeps "what counts as a good
 * recommendation" a product decision the host app owns, not this SDK.
 */

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";

export type AiAssistantPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface AiAssistantRecommendation {
  /** A small icon/emoji rendered next to `category` — plain `ReactNode` so
   * this component never forces a particular icon library on the host app. */
  icon?: ReactNode;
  category: string;
  stat?: { value: string; unit: string };
  description: string;
  cta?: { label: string; href?: string; onClick?: () => void };
}

export interface AiAssistantBlobProps {
  /** Name shown in the greeting — `greeting(name)` defaults to `"Hi, {name}!"`. */
  name: string;
  greeting?: (name: string) => string;
  subtitle?: string;
  /** Shown instead of `recommendation` while the host app is still fetching one. */
  loadingText?: string;
  /** `undefined`/`null` while loading; the host app is responsible for the
   * actual "what to recommend" logic (see file doc comment). */
  recommendation?: AiAssistantRecommendation | null;
  position?: AiAssistantPosition;
  taskPlaceholder?: string;
  /** Called when the visitor submits the task input. There's no built-in
   * task-execution engine here — wire this up to whatever your app can
   * actually do with free text, or omit it to leave the input purely
   * decorative (submissions are silently dropped). */
  onTaskSubmit?: (task: string) => void;
  closeAriaLabel?: string;
  keepAsideAriaLabel?: string;
  accentFrom?: string;
  accentTo?: string;
  /** When set, the "keep aside" docked state persists across reloads in
   * `localStorage` under this key. Omit for in-memory-only (resets on
   * reload) — a perfectly fine default for a lightweight widget. */
  storageKey?: string;
  className?: string;
}

const EYE_ACTIVATION_RADIUS = 160;
const MAX_EYE_OFFSET = 2.5;

function readDocked(storageKey: string | undefined): boolean {
  if (!storageKey || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${storageKey}:docked`) === "1";
  } catch {
    return false;
  }
}

function writeDocked(storageKey: string | undefined, docked: boolean): void {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${storageKey}:docked`, docked ? "1" : "0");
  } catch {
    // Storage unavailable (private browsing, quota) — docked state just
    // won't survive a reload, never a thrown error.
  }
}

const CORNER_STYLE: Record<AiAssistantPosition, CSSProperties> = {
  "bottom-right": { bottom: 24, right: 24 },
  "bottom-left": { bottom: 24, left: 24 },
  "top-right": { top: 24, right: 24 },
  "top-left": { top: 24, left: 24 },
};

const PANEL_CORNER_STYLE: Record<AiAssistantPosition, CSSProperties> = {
  "bottom-right": { bottom: 92, right: 24 },
  "bottom-left": { bottom: 92, left: 24 },
  "top-right": { top: 92, right: 24 },
  "top-left": { top: 92, left: 24 },
};

/** While "kept aside", the blob parks at mid-height on whichever edge its
 * corner belongs to, mostly off-screen — a small peek, not a full hide,
 * so it stays discoverable and clickable. */
function dockedStyle(position: AiAssistantPosition): CSSProperties {
  const onRight = position.endsWith("right");
  return {
    top: "50%",
    transform: "translateY(-50%)",
    ...(onRight ? { right: -30 } : { left: -30 }),
  };
}

export function AiAssistantBlob({
  name,
  greeting = (n) => `Hi, ${n}!`,
  subtitle = "I have a recommendation for you.",
  loadingText = "Give me a second, I'm looking around your workspace…",
  recommendation,
  position = "bottom-right",
  taskPlaceholder = "Describe your task…",
  onTaskSubmit,
  closeAriaLabel = "Close",
  keepAsideAriaLabel = "Keep aside",
  accentFrom = "#ff2ea6",
  accentTo = "#7c3aed",
  storageKey,
  className,
}: AiAssistantBlobProps) {
  const [open, setOpen] = useState(false);
  const [docked, setDocked] = useState(() => readDocked(storageKey));
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const [taskDraft, setTaskDraft] = useState("");
  const blobRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => writeDocked(storageKey, docked), [storageKey, docked]);

  useEffect(() => {
    if (docked) return;
    function handleMouseMove(e: MouseEvent) {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const el = blobRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist === 0 || dist >= EYE_ACTIVATION_RADIUS) {
          setEyeOffset({ x: 0, y: 0 });
          return;
        }
        const pull = 1 - dist / EYE_ACTIVATION_RADIUS;
        setEyeOffset({ x: (dx / dist) * MAX_EYE_OFFSET * pull, y: (dy / dist) * MAX_EYE_OFFSET * pull });
      });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [docked]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        blobRef.current &&
        !blobRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function handleBlobClick() {
    if (docked) {
      setDocked(false);
      return;
    }
    setOpen((v) => !v);
  }

  function handleKeepAside() {
    setOpen(false);
    setDocked(true);
  }

  function handleTaskSubmit(e: FormEvent) {
    e.preventDefault();
    const value = taskDraft.trim();
    if (!value) return;
    onTaskSubmit?.(value);
    setTaskDraft("");
  }

  const gradient = `linear-gradient(135deg, ${accentFrom}, ${accentTo})`;

  return (
    <div className={className}>
      <style>{`
        @keyframes mio-ai-blob-float { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-6px) scale(1.03); } }
        @keyframes mio-ai-blob-blink { 0%, 92%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.15); } }
        @keyframes mio-ai-panel-pop { from { opacity: 0; transform: scale(0.92) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>

      {open && !docked && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={subtitle}
          style={{
            position: "fixed",
            zIndex: 2147483000,
            width: 352,
            maxWidth: "calc(100vw - 48px)",
            background: "#ffffff",
            color: "#1a1a1a",
            border: "1px solid #e5e5e5",
            borderRadius: 16,
            boxShadow: "0 20px 48px rgba(0,0,0,0.2)",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
            animation: "mio-ai-panel-pop 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
            boxSizing: "border-box",
            ...PANEL_CORNER_STYLE[position],
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, padding: "20px 20px 12px" }}>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{greeting(name)}</p>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>{subtitle}</p>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleKeepAside}
                aria-label={keepAsideAriaLabel}
                title={keepAsideAriaLabel}
                style={iconButtonStyle}
              >
                <ChevronIcon position={position} />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label={closeAriaLabel} title={closeAriaLabel} style={iconButtonStyle}>
                ×
              </button>
            </div>
          </div>

          <div style={{ padding: "0 20px" }}>
            {!recommendation ? (
              <p style={{ margin: "8px 0 24px", fontSize: 13, color: "#6b7280" }}>{loadingText}</p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6b7280" }}>
                  {recommendation.icon && (
                    <span style={{ display: "flex", height: 24, width: 24, alignItems: "center", justifyContent: "center", borderRadius: 6, background: "#f3f4f6" }}>
                      {recommendation.icon}
                    </span>
                  )}
                  {recommendation.category}
                </div>

                {recommendation.stat && (
                  <p style={{ margin: "16px 0 0", display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 44,
                        fontWeight: 700,
                        lineHeight: 1,
                        backgroundImage: gradient,
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        color: "transparent",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {recommendation.stat.value}
                    </span>
                    <span style={{ fontSize: 13, color: "#6b7280" }}>{recommendation.stat.unit}</span>
                  </p>
                )}

                <p style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.5 }}>{recommendation.description}</p>

                {recommendation.cta && (
                  <a
                    href={recommendation.cta.href ?? "#"}
                    onClick={(e) => {
                      if (recommendation.cta?.onClick) {
                        if (!recommendation.cta.href) e.preventDefault();
                        recommendation.cta.onClick();
                      }
                      setOpen(false);
                    }}
                    style={{
                      display: "inline-block",
                      marginTop: 16,
                      marginBottom: 20,
                      padding: "8px 16px",
                      borderRadius: 999,
                      background: "#f3f4f6",
                      color: "#1a1a1a",
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: "none",
                      cursor: "pointer",
                    }}
                  >
                    {recommendation.cta.label}
                  </a>
                )}
              </>
            )}
          </div>

          <form onSubmit={handleTaskSubmit} style={{ display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid #eee", padding: 12 }}>
            <span style={{ color: "#9ca3af", fontSize: 16, flexShrink: 0 }}>+</span>
            <input
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
              placeholder={taskPlaceholder}
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#1a1a1a" }}
            />
            <button
              type="submit"
              aria-label="Send"
              style={{ border: "none", background: "transparent", color: "#9ca3af", cursor: taskDraft.trim() ? "pointer" : "default", padding: 0 }}
            >
              <MicOrSendIcon active={taskDraft.trim().length > 0} />
            </button>
          </form>
        </div>
      )}

      <button
        ref={blobRef}
        type="button"
        onClick={handleBlobClick}
        aria-label={subtitle}
        style={{
          position: "fixed",
          zIndex: 2147483000,
          height: 56,
          width: 56,
          padding: 0,
          border: "none",
          borderRadius: "50%",
          cursor: "pointer",
          background: "transparent",
          transition: "top 0.3s ease, right 0.3s ease, bottom 0.3s ease, left 0.3s ease, transform 0.15s ease",
          animation: docked ? undefined : "mio-ai-blob-float 3.2s ease-in-out infinite",
          ...(docked ? dockedStyle(position) : CORNER_STYLE[position]),
        }}
      >
        <span
          style={{
            position: "relative",
            display: "block",
            height: "100%",
            width: "100%",
            borderRadius: "50%",
            background: `radial-gradient(circle at 30% 28%, #ff9ecf 0%, ${accentFrom} 28%, ${accentTo} 100%)`,
            boxShadow: "0 8px 24px -4px rgba(124, 58, 237, 0.5)",
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "radial-gradient(circle at 32% 24%, rgba(255,255,255,0.55), transparent 45%)",
              pointerEvents: "none",
            }}
          />
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transform: `translate(calc(-50% + ${eyeOffset.x}px), calc(-50% + ${eyeOffset.y}px))`,
            }}
          >
            <span style={{ height: 8, width: 8, borderRadius: "50%", background: "#fff", animation: "mio-ai-blob-blink 4.5s ease-in-out infinite" }} />
            <span style={{ height: 10, width: 10, borderRadius: "50%", background: "#fff", animation: "mio-ai-blob-blink 4.5s ease-in-out infinite" }} />
          </span>
        </span>
      </button>
    </div>
  );
}

const iconButtonStyle: CSSProperties = {
  display: "flex",
  height: 24,
  width: 24,
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  background: "transparent",
  color: "#9ca3af",
  fontSize: 16,
  lineHeight: 1,
  cursor: "pointer",
  borderRadius: 6,
  padding: 0,
};

function ChevronIcon({ position }: { position: AiAssistantPosition }) {
  const onRight = position.endsWith("right");
  return <span style={{ fontSize: 13 }}>{onRight ? "›" : "‹"}</span>;
}

function MicOrSendIcon({ active }: { active: boolean }) {
  return <span style={{ fontSize: 14 }}>{active ? "➤" : "\u{1F3A4}"}</span>;
}
