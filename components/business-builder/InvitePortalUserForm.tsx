"use client";

/**
 * InvitePortalUserForm — adds another person to a client's portal from
 * the Business Builder side, so a coach no longer has to wait for the
 * client lead to do it (or accept their own invitation first).
 *
 * Collapsed by default: the common case on this page is checking a
 * client's portal setup, not adding people, and an always-open form
 * pushes the module toggles below the fold.
 */

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { invitePortalUser } from "@/lib/actions/invite-portal-user";

export function InvitePortalUserForm({
  engagementId,
  clientLabel,
}: {
  engagementId: string;
  clientLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("client_manager");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setSentTo(null);
    startTransition(async () => {
      const r = await invitePortalUser({
        engagementId,
        fullName: fullName.trim(),
        email: email.trim(),
        role,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSentTo(r.email);
      setFullName("");
      setEmail("");
      setRole("client_manager");
    });
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" aria-hidden /> Add someone to this
          portal
        </button>
        {sentTo && (
          <p className="text-xs text-tbb-blue flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
            Invitation sent to {sentTo}.
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="border border-tbb-line-soft rounded-md bg-white p-3 space-y-3"
    >
      <p className="text-xs text-tbb-ink-3 max-w-2xl">
        Invite another person into {clientLabel}&apos;s portal. They get an
        email from Clerk to set up their login.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
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
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Email
          </span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            placeholder="jamie@theircompany.com"
            className={inputCls}
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Their access
        </span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={isPending}
          className={inputCls}
        >
          <option value="client_employee">
            Team member — shared workspace only
          </option>
          <option value="client_manager">
            Manager — also sees leadership conversations and gets session
            recaps
          </option>
          <option value="client_lead">
            Lead — full access, can invite their own people
          </option>
        </select>
      </label>

      {error && (
        <p
          role="alert"
          className="text-xs text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-white"
        >
          {error}
        </p>
      )}
      {sentTo && (
        <p className="text-xs text-tbb-blue flex items-center gap-1.5 border border-tbb-blue/30 rounded-md px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
          Invitation sent to {sentTo}.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <UserPlus className="w-3.5 h-3.5" aria-hidden />
          )}
          {isPending ? "Sending…" : "Send invitation"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border border-tbb-line text-tbb-ink-3 hover:text-tbb-navy"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue";
