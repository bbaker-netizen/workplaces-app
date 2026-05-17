"use client";

/**
 * Builder Buddy v2 — an AI chat assistant you summon on demand.
 *
 * v1 was a bobbing mascot in the corner that auto-popped tips. Bruce
 * said it drove him nuts. So v1 is gone. This version:
 *
 *   - Hides until you call it (small "Ask Buddy" pill button in the
 *     bottom-right; press "?" to summon from keyboard).
 *   - Opens a chat panel that slides up from the corner.
 *   - Buddy character walks in from off-screen the first time the
 *     panel opens — bit of welcome animation, then settles.
 *   - You can type any question. Powered by Claude with a system
 *     prompt that knows the app's modules, methodology, and brand
 *     voice.
 *   - Multi-turn conversation kept in component state.
 *   - "New chat" resets the thread.
 *   - Suggested starter questions when the panel first opens.
 *   - localStorage remembers if you've muted Buddy globally.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  HelpCircle,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { askBuddy, type BuddyMessage } from "@/lib/actions/ask-buddy";

const STORAGE_MUTED = "tbb_buddy_muted_v2";

const STARTERS: { label: string; text: string }[] = [
  {
    label: "How do I add a prospect?",
    text: "How do I add a new prospect to the pipeline?",
  },
  {
    label: "Action items vs Deliverables?",
    text: "What's the difference between Action Items, Deliverables, Projects, and Goals?",
  },
  {
    label: "What's the Soul File?",
    text: "What is the Soul File and why does it matter?",
  },
  {
    label: "How do I send a contract?",
    text: "How do I send a contract for signature?",
  },
];

export function BuilderBuddy() {
  const pathname = usePathname() ?? "";
  const [muted, setMuted] = useState<boolean>(false);
  const [open, setOpen] = useState(false);
  const [walkedIn, setWalkedIn] = useState(false);
  const [messages, setMessages] = useState<BuddyMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load mute pref once.
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(STORAGE_MUTED) === "1");
    } catch {
      /* SSR / private mode */
    }
  }, []);

  // Keyboard: "?" or "/" toggles Buddy, "Esc" closes.
  useEffect(() => {
    if (muted) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const inField =
        tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      if (!inField && (e.key === "?" || e.key === "/")) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (open && e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [muted, open]);

  // Trigger the walk-in animation the first time the panel opens.
  useEffect(() => {
    if (open && !walkedIn) {
      // Slight delay so the panel slide-in completes first.
      const t = setTimeout(() => setWalkedIn(true), 50);
      return () => clearTimeout(t);
    }
  }, [open, walkedIn]);

  // Auto-scroll the chat to the bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      const userMsg: BuddyMessage = { role: "user", content: text };
      const next = [...messages, userMsg];
      setMessages(next);
      setDraft("");
      setError(null);
      setIsThinking(true);
      try {
        const r = await askBuddy(next, pathname);
        if (!r.ok) {
          setError(r.error);
        } else {
          setMessages([...next, { role: "assistant", content: r.reply }]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Buddy is unreachable.");
      } finally {
        setIsThinking(false);
      }
    },
    [messages, pathname],
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isThinking) return;
    send(trimmed);
  }

  function muteForever() {
    setMuted(true);
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_MUTED, "1");
    } catch {
      /* no-op */
    }
  }

  function unmute() {
    setMuted(false);
    try {
      localStorage.removeItem(STORAGE_MUTED);
    } catch {
      /* no-op */
    }
  }

  if (muted) {
    // Tiny ghost button so you can bring Buddy back without digging.
    return (
      <button
        type="button"
        onClick={unmute}
        title="Bring Buddy back"
        className="fixed bottom-3 right-3 z-40 grid place-items-center w-7 h-7 rounded-full text-tbb-ink-4 hover:text-tbb-blue bg-white/60 backdrop-blur border border-tbb-line/40 transition-colors"
        aria-label="Bring Builder Buddy back"
      >
        <HelpCircle className="w-3.5 h-3.5" aria-hidden />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 pointer-events-none">
      {open && (
        <div
          className="pointer-events-auto bg-white border border-tbb-line rounded-2xl shadow-tbb-lg w-[min(380px,calc(100vw-3rem))] h-[min(540px,calc(100vh-7rem))] flex flex-col origin-bottom-right animate-[buddyPop_220ms_ease-out] overflow-hidden"
          role="dialog"
          aria-label="Builder Buddy chat"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-tbb-line-soft bg-gradient-to-br from-tbb-navy to-tbb-blue text-white">
            <div
              className={
                "shrink-0 relative grid place-items-center w-11 h-11 rounded-full bg-tbb-warning/90 overflow-hidden transition-transform " +
                (walkedIn ? "" : "animate-[buddyWalkIn_700ms_ease-out]")
              }
            >
              <BuilderSvg />
              {/* Online indicator — small green dot bottom-right of the
                  avatar, says "I'm awake and listening". */}
              <span
                aria-hidden
                className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-tbb-success ring-2 ring-tbb-navy"
              />
            </div>
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-base font-bold">Builder Buddy</p>
              <p className="text-[11px] text-white/70 mt-0.5">
                Your in-app assistant
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid place-items-center w-8 h-8 rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-tbb-cream-50"
          >
            {messages.length === 0 ? (
              <div className="space-y-3">
                <div className="bg-white border border-tbb-line rounded-2xl rounded-tl-md px-3 py-2.5 text-sm text-tbb-ink-2 leading-snug">
                  Hey — I&apos;m Buddy. Ask me anything about the app, your
                  practice, or whatever&apos;s on your screen. I&apos;ll keep
                  it short. Try one of these to start, or just type:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STARTERS.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => send(s.text)}
                      className="text-[11px] font-bold uppercase tracking-tbb-caps px-2.5 py-1.5 rounded-pill bg-white text-tbb-blue border border-tbb-line hover:bg-tbb-blue hover:text-white transition-colors duration-tbb-fast"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <ChatBubble key={i} role={m.role} content={m.content} />
              ))
            )}
            {isThinking && (
              <div className="flex items-center gap-2 text-xs text-tbb-ink-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                <span>Buddy&apos;s thinking…</span>
              </div>
            )}
            {error && (
              <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-white">
                {error}
              </p>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={onSubmit}
            className="border-t border-tbb-line-soft p-2 bg-white"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSubmit(e as unknown as React.FormEvent);
                  }
                }}
                rows={1}
                placeholder="Ask Buddy anything…"
                disabled={isThinking}
                className="flex-1 resize-none bg-tbb-cream-50 border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue min-h-[36px] max-h-32"
              />
              <button
                type="submit"
                disabled={isThinking || !draft.trim()}
                aria-label="Send"
                className="grid place-items-center w-9 h-9 rounded-md bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-40 transition-colors"
              >
                <Send className="w-4 h-4" aria-hidden />
              </button>
            </div>
            <div className="mt-2 px-1 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[10px] text-tbb-ink-4 leading-relaxed">
                <kbd className="px-1 py-0.5 bg-tbb-cream-50 border border-tbb-line rounded text-tbb-ink-3 font-mono text-[9px]">
                  Enter
                </kbd>{" "}
                to send ·{" "}
                <kbd className="px-1 py-0.5 bg-tbb-cream-50 border border-tbb-line rounded text-tbb-ink-3 font-mono text-[9px]">
                  ?
                </kbd>{" "}
                to summon
              </span>
              <div className="flex items-center gap-3">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([]);
                      setError(null);
                    }}
                    className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
                  >
                    New chat
                  </button>
                )}
                <button
                  type="button"
                  onClick={muteForever}
                  className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-4 hover:text-tbb-danger"
                >
                  Hide Buddy
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ask Builder Buddy"
        title="Ask Buddy — keyboard shortcut: ?"
        className={
          "app-drift pointer-events-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-pill app-cta-orange shadow-tbb-md cursor-pointer transition-all duration-tbb-base hover:scale-105 hover:shadow-tbb-lg " +
          (open ? "opacity-0 pointer-events-none" : "opacity-100")
        }
      >
        <span className="app-pulse relative grid place-items-center w-7 h-7 rounded-full bg-white/20">
          <Sparkles className="w-3.5 h-3.5" aria-hidden />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-tbb-success ring-2 ring-white" />
        </span>
        <span className="text-xs font-bold uppercase tracking-tbb-caps">
          Ask Buddy
        </span>
      </button>
    </div>
  );
}

function ChatBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const isUser = role === "user";
  return (
    <div className={"flex gap-2 " + (isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-tbb-navy text-white mt-0.5">
          <MessageCircle className="w-3.5 h-3.5" aria-hidden />
        </div>
      )}
      <div
        className={
          "max-w-[78%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap leading-snug " +
          (isUser
            ? "bg-tbb-blue text-white rounded-tr-md"
            : "bg-white border border-tbb-line text-tbb-ink-2 rounded-tl-md")
        }
      >
        {content}
      </div>
    </div>
  );
}

/**
 * Buddy mascot — sized for a 44px circular avatar. Just head + hat so
 * it doesn't get awkwardly cropped at the bottom of a round frame.
 * The full-body version lives on the "Ask Buddy" pill where there's
 * room.
 */
function BuilderSvg() {
  return (
    <svg
      viewBox="0 0 40 40"
      className="w-10 h-10"
      aria-hidden="true"
      role="img"
    >
      {/* Hard hat dome */}
      <path
        d="M 8 18 Q 8 8 20 8 Q 32 8 32 18 L 32 20 L 8 20 Z"
        fill="#E87722"
      />
      {/* Hat brim */}
      <rect x="6" y="19" width="28" height="2.5" rx="1.25" fill="#C45D14" />
      {/* Top button */}
      <circle cx="20" cy="9" r="1.6" fill="#C45D14" />
      {/* Face */}
      <circle cx="20" cy="26" r="8" fill="#F4C9A7" />
      {/* Eyes */}
      <circle cx="17" cy="25" r="1.1" fill="#1A1A1A" />
      <circle cx="23" cy="25" r="1.1" fill="#1A1A1A" />
      {/* Smile */}
      <path
        d="M 16.5 28.5 Q 20 31.5 23.5 28.5"
        stroke="#1A1A1A"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
      {/* Small rosy cheeks */}
      <circle cx="14.5" cy="27.5" r="1.2" fill="#E87722" opacity="0.35" />
      <circle cx="25.5" cy="27.5" r="1.2" fill="#E87722" opacity="0.35" />
    </svg>
  );
}
