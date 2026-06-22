"use client";

/**
 * BusinessBuildersManager — master-admin tool to invite internal users
 * and set each one's access level.
 *
 *   • Standard Business Builder (coach) — full coaching surface, but NO
 *     system settings (integrations, company info, pricing, this page).
 *   • Master admin — everything, including system settings.
 *
 * Invites go out via Clerk; the new user lands in the master org with the
 * chosen role on first sign-in.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, SlidersHorizontal, UserPlus } from "lucide-react";
import {
  inviteBusinessBuilder,
  setBusinessBuilderRole,
} from "@/lib/actions/business-builder-invites";
import { setBbUserAccess } from "@/lib/actions/bb-access";
import { CONSOLE_MODULES } from "@/lib/console-modules";
import type { InternalUser } from "@/lib/db/queries/business-builders";

const inputCls =
  "w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue";

const ROLE_LABEL: Record<InternalUser["role"], string> = {
  master_admin: "Master admin",
  coach: "Standard Business Builder",
};

export type BbUserAccess = {
  allClientsAccess: boolean;
  allowedConsoleModules: string[] | null;
  grantedEngagementIds: string[];
};

type Client = { id: string; name: string };

export function BusinessBuildersManager({
  users,
  currentUserProfileId,
  clients,
  accessByUser,
}: {
  users: InternalUser[];
  currentUserProfileId: string;
  clients: Client[];
  accessByUser: Record<string, BbUserAccess>;
}) {
  return (
    <div className="space-y-8">
      <InviteForm />
      <TeamList
        users={users}
        currentUserProfileId={currentUserProfileId}
        clients={clients}
        accessByUser={accessByUser}
      />
    </div>
  );
}

function InviteForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InternalUser["role"]>("coach");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setOkMsg(null);
    startTransition(async () => {
      const r = await inviteBusinessBuilder({
        fullName: fullName.trim(),
        email: email.trim(),
        role,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOkMsg(`Invitation sent to ${r.email}.`);
      setFullName("");
      setEmail("");
      setRole("coach");
      router.refresh();
    });
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-6 shadow-tbb-sm space-y-4">
      <div className="space-y-1">
        <h2 className="font-bold text-tbb-navy text-lg">Invite a Business Builder</h2>
        <p className="text-sm text-tbb-ink-3">
          They&apos;ll get an email invitation and land in your console on
          sign-in. Standard Business Builders can run engagements but
          can&apos;t reach system settings.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Full name
            </span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jen Smith"
              disabled={isPending}
              className={inputCls}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jen@4workplaces.com"
              disabled={isPending}
              className={inputCls}
              required
            />
          </label>
        </div>
        <label className="block space-y-1 max-w-xs">
          <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Access level
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as InternalUser["role"])}
            disabled={isPending}
            className={inputCls}
          >
            <option value="coach">Standard Business Builder (no settings)</option>
            <option value="master_admin">Master admin (full access)</option>
          </select>
        </label>
        {error && <p className="text-sm text-tbb-danger">{error}</p>}
        {okMsg && <p className="text-sm text-tbb-success">{okMsg}</p>}
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

function TeamList({
  users,
  currentUserProfileId,
  clients,
  accessByUser,
}: {
  users: InternalUser[];
  currentUserProfileId: string;
  clients: Client[];
  accessByUser: Record<string, BbUserAccess>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        Your team ({users.length})
      </h2>
      <ul className="space-y-2">
        {users.map((u) => (
          <TeamRow
            key={u.id}
            user={u}
            isSelf={u.id === currentUserProfileId}
            clients={clients}
            access={
              accessByUser[u.id] ?? {
                allClientsAccess: true,
                allowedConsoleModules: null,
                grantedEngagementIds: [],
              }
            }
          />
        ))}
      </ul>
    </section>
  );
}

function TeamRow({
  user,
  isSelf,
  clients,
  access,
}: {
  user: InternalUser;
  isSelf: boolean;
  clients: Client[];
  access: BbUserAccess;
}) {
  const router = useRouter();
  const [role, setRole] = useState<InternalUser["role"]>(user.role);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showAccess, setShowAccess] = useState(false);

  function changeRole(next: InternalUser["role"]) {
    const prev = role;
    setRole(next);
    setError(null);
    startTransition(async () => {
      const r = await setBusinessBuilderRole({
        userProfileId: user.id,
        role: next,
      });
      if (!r.ok) {
        setRole(prev); // revert optimistic change
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  // Only standard Business Builders (not the admin, not yourself) have
  // configurable client/module access — admins always get everything.
  const canConfigureAccess = !isSelf && role === "coach";

  return (
    <li className="rounded-lg border border-tbb-line bg-white shadow-tbb-sm">
      <div className="flex items-center gap-4 p-4">
        <span className="grid place-items-center w-9 h-9 rounded-full bg-tbb-blue-50 text-tbb-blue font-bold text-sm shrink-0">
          {user.fullName.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-tbb-navy truncate">
            {user.fullName}
            {isSelf && (
              <span className="ml-2 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                You
              </span>
            )}
          </p>
          <p className="text-xs text-tbb-ink-3 truncate">{user.email}</p>
          {error && <p className="text-[11px] text-tbb-danger mt-1">{error}</p>}
        </div>
        {canConfigureAccess && (
          <button
            type="button"
            onClick={() => setShowAccess((s) => !s)}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:text-tbb-blue-700 shrink-0"
            aria-expanded={showAccess}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden />
            Access
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showAccess ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        )}
        {isSelf ? (
          <span className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 shrink-0">
            {ROLE_LABEL[role]}
          </span>
        ) : (
          <select
            value={role}
            onChange={(e) => changeRole(e.target.value as InternalUser["role"])}
            disabled={isPending}
            aria-label={`Access level for ${user.fullName}`}
            className="bg-white border border-tbb-line rounded-md px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-tbb-blue disabled:opacity-50 shrink-0"
          >
            <option value="coach">Standard</option>
            <option value="master_admin">Master admin</option>
          </select>
        )}
      </div>
      {canConfigureAccess && showAccess && (
        <AccessEditor user={user} clients={clients} access={access} />
      )}
    </li>
  );
}

function AccessEditor({
  user,
  clients,
  access,
}: {
  user: InternalUser;
  clients: Client[];
  access: BbUserAccess;
}) {
  const router = useRouter();
  const [allClients, setAllClients] = useState(access.allClientsAccess);
  const [grantedIds, setGrantedIds] = useState<Set<string>>(
    new Set(access.grantedEngagementIds),
  );
  const [allModules, setAllModules] = useState(
    access.allowedConsoleModules === null,
  );
  const [allowedModules, setAllowedModules] = useState<Set<string>>(
    new Set(access.allowedConsoleModules ?? CONSOLE_MODULES.map((m) => m.href)),
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await setBbUserAccess({
        userProfileId: user.id,
        allClientsAccess: allClients,
        allowedConsoleModules: allModules ? null : Array.from(allowedModules),
        grantedEngagementIds: allClients ? [] : Array.from(grantedIds),
      });
      setMsg(r.ok ? "Saved." : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="border-t border-tbb-line px-4 py-4 space-y-5 bg-tbb-cream/40">
      {/* Clients */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue">
          Clients
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`clients-${user.id}`}
            checked={allClients}
            onChange={() => setAllClients(true)}
          />
          All clients
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`clients-${user.id}`}
            checked={!allClients}
            onChange={() => setAllClients(false)}
          />
          Only selected clients
        </label>
        {!allClients && (
          <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {clients.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={grantedIds.has(c.id)}
                  onChange={() => setGrantedIds((s) => toggle(s, c.id))}
                />
                {c.name}
              </label>
            ))}
            {clients.length === 0 && (
              <p className="text-xs text-tbb-ink-3 italic">No clients yet.</p>
            )}
          </div>
        )}
      </div>

      {/* Modules */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue">
          Console modules
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`modules-${user.id}`}
            checked={allModules}
            onChange={() => setAllModules(true)}
          />
          All modules
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`modules-${user.id}`}
            checked={!allModules}
            onChange={() => setAllModules(false)}
          />
          Only selected modules
        </label>
        {!allModules && (
          <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {CONSOLE_MODULES.map((m) => (
              <label key={m.href} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowedModules.has(m.href)}
                  onChange={() => setAllowedModules((s) => toggle(s, m.href))}
                />
                {m.label}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-60"
        >
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
          {isPending ? "Saving…" : "Save access"}
        </button>
        {msg && <span className="text-xs text-tbb-ink-3">{msg}</span>}
      </div>
    </div>
  );
}
