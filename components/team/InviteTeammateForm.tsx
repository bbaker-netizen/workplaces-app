"use client";

/**
 * InviteTeammateForm — lets a client lead invite a teammate straight
 * from the My Team page. Shown only to the lead (server-side gated too).
 */

import { useState, useTransition } from "react";
import { Loader2, UserPlus, CheckCircle2 } from "lucide-react";
import { inviteTeammate } from "@/lib/actions/team-invites";

export function InviteTeammateForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("client_employee");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setSentTo(null);
    startTransition(async () => {
      const r = await inviteTeammate({ fullName: fullName.trim(), email: email.trim(), role });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSentTo(r.email);
      setFullName("");
      setEmail("");
      setRole("client_employee");
    });
  }

  return (
    <section className="border border-tbb-line rounded-md bg-tbb-cream-50 p-5 space-y-4">
      <div className="space-y-1">
        <h2 className="font-bold text-foreground text-lg tracking-tight flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-tbb-blue" aria-hidden />
          Invite a teammate
        </h2>
        <p className="font-sans text-xs text-muted-foreground">
          Add someone from your team. They&apos;ll get an email to join this
          engagement — invite or don&apos;t, it&apos;s up to you.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Full name
            </span>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isPending}
              placeholder="Jamie Lee"
              className={inputCls}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Email
            </span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              placeholder="jamie@yourcompany.com"
              className={inputCls}
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Their access
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={isPending}
            className={inputCls}
          >
            <option value="client_employee">Team member — sees the shared workspace</option>
            <option value="client_manager">Manager — also sees leadership conversations</option>
          </select>
        </label>

        {error && (
          <p role="alert" className="text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-white">
            {error}
          </p>
        )}
        {sentTo && (
          <p className="text-sm text-tbb-blue flex items-center gap-2 border border-tbb-blue/30 rounded-md px-3 py-2 bg-white">
            <CheckCircle2 className="w-4 h-4" aria-hidden />
            Invitation sent to {sentTo}.
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <UserPlus className="w-4 h-4" aria-hidden />
          )}
          {isPending ? "Sending…" : "Send invitation"}
        </button>
      </form>
    </section>
  );
}

const inputCls =
  "w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue";
