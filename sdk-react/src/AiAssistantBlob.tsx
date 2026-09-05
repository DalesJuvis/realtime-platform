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
import { Mic, Send } from "lucide-react";

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
  /** Theme of the panel that opens on click (the blob itself is
   * accent-colored regardless — see `accentFrom`/`accentTo`). Explicit
   * prop rather than auto-detected `prefers-color-scheme`, same
   * convention as `PushPermissionPopup`'s `theme` — the host app decides
   * when to flip it (its own theme toggle, `prefers-color-scheme`
   * listener, whatever it already has). */
  theme?: "light" | "dark";
  /** When set, the "keep aside" docked state persists across reloads in
   * `localStorage` under this key. Omit for in-memory-only (resets on
   * reload) — a perfectly fine default for a lightweight widget. */
  storageKey?: string;
  className?: string;
}

const EYE_ACTIVATION_RADIUS = 160;
const MAX_EYE_OFFSET = 2.5;

/** `#rrggbb` -> `"r, g, b"`, for building an `rgba(...)` shadow tinted to
 * match whatever `accentTo` the host app passes in — falls back to a
 * neutral gray for any other format (named colors, `rgb()`, `hsl()`)
 * rather than a real CSS color parser this component doesn't need. */
function hexToRgbTriplet(hex: string): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return "17, 24, 39";
  const value = match[1]!;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

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
  theme = "light",
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
  const dark = theme === "dark";
  const panelBg = dark ? "#1e1f26" : "#ffffff";
  const panelFg = dark ? "#f3f3f5" : "#1a1a1a";
  const panelMuted = dark ? "#a3a3ab" : "#6b7280";
  const panelBorder = dark ? "#33343d" : "#e5e5e5";
  const panelDivider = dark ? "#2c2d34" : "#eeeeee";
  const chipBg = dark ? "#2a2b33" : "#f3f4f6";
  const inputClassName = dark ? "mio-ai-task-input-dark" : "mio-ai-task-input-light";

  return (
    <div className={className}>
      <style>{`
        @keyframes mio-ai-blob-float { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-6px) scale(1.03); } }
        @keyframes mio-ai-blob-blink { 0%, 92%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.15); } }
        @keyframes mio-ai-panel-pop { from { opacity: 0; transform: scale(0.92) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .mio-ai-task-input-light::placeholder { color: #9ca3af; }
        .mio-ai-task-input-dark::placeholder { color: #6b7280; }
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
            background: panelBg,
            color: panelFg,
            border: `1px solid ${panelBorder}`,
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
              <p style={{ margin: "2px 0 0", fontSize: 13, color: panelMuted }}>{subtitle}</p>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleKeepAside}
                aria-label={keepAsideAriaLabel}
                title={keepAsideAriaLabel}
                style={{ ...iconButtonStyle, color: panelMuted }}
              >
                <ChevronIcon position={position} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={closeAriaLabel}
                title={closeAriaLabel}
                style={{ ...iconButtonStyle, color: panelMuted }}
              >
                ×
              </button>
            </div>
          </div>

          <div style={{ padding: "0 20px" }}>
            {!recommendation ? (
              <p style={{ margin: "8px 0 24px", fontSize: 13, color: panelMuted }}>{loadingText}</p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: panelMuted }}>
                  {recommendation.icon && (
                    <span style={{ display: "flex", height: 24, width: 24, alignItems: "center", justifyContent: "center", borderRadius: 6, background: chipBg }}>
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
                    <span style={{ fontSize: 13, color: panelMuted }}>{recommendation.stat.unit}</span>
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
                      background: chipBg,
                      color: panelFg,
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

          <form onSubmit={handleTaskSubmit} style={{ display: "flex", alignItems: "center", gap: 8, borderTop: `1px solid ${panelDivider}`, padding: 12 }}>
            <span style={{ color: panelMuted, fontSize: 16, flexShrink: 0 }}>+</span>
            <input
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
              placeholder={taskPlaceholder}
              className={inputClassName}
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, color: panelFg }}
            />
            <button
              type="submit"
              aria-label="Send"
              style={{ border: "none", background: "transparent", color: panelMuted, cursor: taskDraft.trim() ? "pointer" : "default", padding: 0 }}
            >
              {taskDraft.trim() ? <Send size={14} /> : <Mic size={14} />}
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
            background: `radial-gradient(circle at 30% 28%, ${accentFrom} 0%, ${accentTo} 100%)`,
            boxShadow: `0 8px 24px -4px rgba(${hexToRgbTriplet(accentTo)}, 0.5)`,
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
