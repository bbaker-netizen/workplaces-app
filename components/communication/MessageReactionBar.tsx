"use client";

/**
 * MessageReactionBar — pill chips + "+ reaction" hover trigger.
 *
 * Phase 1.3.5. Renders below the message body when the row is in its
 * normal (non-edit, non-tombstone) state.
 *
 * Layout:
 *   [👍 2] [❤️ 1] [+ reaction]   ← chips, then the add-reaction control
 *
 * Click a chip → toggle that emoji on/off for the viewer (server action).
 * Click the + → quick-pick row (👍 ❤️ 😂 🎉 👀 ✅) plus an "Other" button
 * that opens the full picker.
 *
 * Optimistic UI: chip state flips locally before the server settles, so
 * the click feels instant. The server-revalidated render replaces the
 * optimistic state on success; on failure we revert and surface an
 * inline error.
 */

import { useState, useTransition, useEffect } from "react";
import { SmilePlus } from "lucide-react";
import { toggleReaction } from "@/lib/actions/message-reactions";
import { EmojiPickerButton } from "./EmojiPickerButton";
import type {
  ReactionGroup,
  ReactionsByEmoji,
} from "@/lib/db/queries/message-reactions";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅"] as const;

type LocalState = {
  groups: ReactionGroup[];
  /** Per-emoji optimistic delta tracker for the rare double-click race. */
};

function applyToggle(
  groups: ReactionGroup[],
  emoji: string,
  viewerUserProfileId: string,
  viewerName: string,
): ReactionGroup[] {
  const idx = groups.findIndex((g) => g.emoji === emoji);
  if (idx === -1) {
    // Brand new chip with the viewer as the sole reactor.
    return [
      ...groups,
      {
        emoji,
        count: 1,
        viewerReacted: true,
        users: [{ userProfileId: viewerUserProfileId, fullName: viewerName }],
      },
    ];
  }
  const existing = groups[idx];
  if (existing.viewerReacted) {
    // Remove the viewer's reaction.
    const nextUsers = existing.users.filter(
      (u) => u.userProfileId !== viewerUserProfileId,
    );
    if (nextUsers.length === 0) {
      // Drop the chip entirely.
      return groups.filter((_, i) => i !== idx);
    }
    const next = [...groups];
    next[idx] = {
      ...existing,
      count: existing.count - 1,
      viewerReacted: false,
      users: nextUsers,
    };
    return next;
  }
  // Add the viewer's reaction.
  const next = [...groups];
  next[idx] = {
    ...existing,
    count: existing.count + 1,
    viewerReacted: true,
    users: [
      ...existing.users,
      { userProfileId: viewerUserProfileId, fullName: viewerName },
    ],
  };
  return next;
}

export function MessageReactionBar({
  messageId,
  reactions,
  viewerUserProfileId,
}: {
  messageId: string;
  reactions: ReactionsByEmoji;
  viewerUserProfileId: string;
}) {
  const [local, setLocal] = useState<LocalState>({ groups: reactions });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Sync external props when the server revalidates this row.
  useEffect(() => {
    setLocal({ groups: reactions });
  }, [reactions]);

  // The viewer's display name is whatever the server has on record; we
  // approximate it for the optimistic chip with "You". Once the server
  // revalidates, the real name replaces it.
  const viewerDisplayName = "You";

  const onToggle = (emoji: string) => {
    setError(null);
    setLocal((prev) => ({
      groups: applyToggle(
        prev.groups,
        emoji,
        viewerUserProfileId,
        viewerDisplayName,
      ),
    }));
    startTransition(async () => {
      const result = await toggleReaction({ messageId, emoji });
      if (!result.ok) {
        // Revert by re-applying the same toggle (it's its own inverse).
        setLocal((prev) => ({
          groups: applyToggle(
            prev.groups,
            emoji,
            viewerUserProfileId,
            viewerDisplayName,
          ),
        }));
        setError(result.error);
      }
    });
  };

  const groups = local.groups;
  const reactedSet = new Set(
    groups.filter((g) => g.viewerReacted).map((g) => g.emoji),
  );

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {groups.map((g) => {
        const tooltip = g.users.map((u) => u.fullName).join(", ");
        return (
          <button
            key={g.emoji}
            type="button"
            onClick={() => onToggle(g.emoji)}
            disabled={isPending}
            title={tooltip}
            aria-label={`${g.emoji} ${g.count} ${
              g.count === 1 ? "reaction" : "reactions"
            }${g.viewerReacted ? " (you reacted)" : ""}`}
            aria-pressed={g.viewerReacted}
            className={
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors disabled:cursor-wait disabled:opacity-60 " +
              (g.viewerReacted
                ? "bg-[#F5F1E8] border-[#2E4057] text-[#2E4057] hover:bg-[#E9E2CD]"
                : "bg-white border-[#CCCCCC] text-foreground hover:bg-[#F5F1E8] hover:border-[#666666]")
            }
          >
            <span aria-hidden className="text-sm leading-none">
              {g.emoji}
            </span>
            <span className="font-mono tabular-nums">{g.count}</span>
          </button>
        );
      })}
      <ReactionAdder
        onPick={onToggle}
        disabled={isPending}
        viewerReactedEmojis={reactedSet}
      />
      {error && (
        <span
          role="alert"
          className="font-sans text-xs text-[#E87722] ml-1"
        >
          {error}
        </span>
      )}
    </div>
  );
}

/* ----------------------------- adder control ----------------------------- */

function ReactionAdder({
  onPick,
  disabled,
  viewerReactedEmojis,
}: {
  onPick: (emoji: string) => void;
  disabled: boolean;
  viewerReactedEmojis: Set<string>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        aria-label="Add reaction"
        title="Add reaction"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={
          "inline-flex items-center gap-1 rounded-full border border-dashed border-[#CCCCCC] px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-[#F5F1E8] hover:border-[#666666] transition-colors disabled:opacity-60 disabled:cursor-wait " +
          (open ? "bg-[#F5F1E8] text-foreground border-[#666666]" : "")
        }
      >
        <SmilePlus className="w-3.5 h-3.5" aria-hidden />
        <span className="font-mono uppercase tracking-[0.15em] text-[10px]">
          react
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 mb-1 z-40 flex items-center gap-1 rounded-md border border-[#CCCCCC] bg-white px-2 py-1.5 shadow-md"
          onMouseLeave={() => setOpen(false)}
        >
          {QUICK_REACTIONS.map((q) => (
            <button
              key={q}
              type="button"
              role="menuitemcheckbox"
              aria-label={`React with ${q}`}
              aria-checked={viewerReactedEmojis.has(q)}
              disabled={disabled}
              onClick={() => {
                onPick(q);
                setOpen(false);
              }}
              className={
                "text-base leading-none w-7 h-7 grid place-items-center rounded hover:bg-[#F5F1E8] disabled:opacity-60 disabled:cursor-wait " +
                (viewerReactedEmojis.has(q) ? "bg-[#F5F1E8]" : "")
              }
            >
              <span aria-hidden>{q}</span>
            </button>
          ))}
          <span className="w-px h-5 bg-[#CCCCCC] mx-0.5" aria-hidden />
          <EmojiPickerButton
            ariaLabel="More emojis"
            triggerClassName="text-xs font-mono uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground hover:bg-[#F5F1E8] rounded px-1.5 py-1"
            triggerContent="more"
            anchor="top"
            align="right"
            onSelect={(emoji) => {
              onPick(emoji);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
