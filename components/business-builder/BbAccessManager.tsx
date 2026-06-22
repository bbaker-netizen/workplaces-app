"use client";

import { useState, useTransition } from "react";
import { setBbUserAccess } from "@/lib/actions/bb-access";
import type { BbUserAdminRow } from "@/lib/db/queries/bb-access";
import type { ConsoleModule } from "@/lib/console-modules";

export function BbAccessManager({
  users,
  clients,
  modules,
}: {
  users: BbUserAdminRow[];
  clients: { id: string; name: string }[];
  modules: ConsoleModule[];
}) {
  return (
    <div className="space-y-4">
      {users.map((u) => (
        <UserCard key={u.userProfileId} user={u} clients={clients} modules={modules} />
      ))}
      {users.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No Business Builders yet.
        </p>
      )}
    </div>
  );
}

function UserCard({
  user,
  clients,
  modules,
}: {
  user: BbUserAdminRow;
  clients: { id: string; name: string }[];
  modules: ConsoleModule[];
}) {
  const isAdmin = user.role === "master_admin";
  const [allClients, setAllClients] = useState(user.allClientsAccess);
  const [grantedIds, setGrantedIds] = useState<Set<string>>(
    new Set(user.grantedEngagementIds),
  );
  // null = all modules
  const [allModules, setAllModules] = useState(user.allowedConsoleModules === null);
  const [allowedModules, setAllowedModules] = useState<Set<string>>(
    new Set(user.allowedConsoleModules ?? modules.map((m) => m.href)),
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await setBbUserAccess({
        userProfileId: user.userProfileId,
        allClientsAccess: allClients,
        allowedConsoleModules: allModules ? null : Array.from(allowedModules),
        grantedEngagementIds: allClients ? [] : Array.from(grantedIds),
      });
      setMsg(res.ok ? "Saved." : res.error);
    });
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="font-bold text-foreground">{user.fullName}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{user.email}</p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
          {isAdmin ? "Master admin" : "Business Builder"}
        </span>
      </div>

      {isAdmin ? (
        <p className="text-sm text-muted-foreground italic">
          Master admins always have full access to every client and module.
        </p>
      ) : (
        <>
          {/* Clients */}
          <div className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-blue">
              Clients
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`clients-${user.userProfileId}`}
                checked={allClients}
                onChange={() => setAllClients(true)}
              />
              All clients
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`clients-${user.userProfileId}`}
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
                  <p className="text-xs text-muted-foreground italic">
                    No clients yet.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Modules */}
          <div className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-blue">
              Console modules
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`modules-${user.userProfileId}`}
                checked={allModules}
                onChange={() => setAllModules(true)}
              />
              All modules
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`modules-${user.userProfileId}`}
                checked={!allModules}
                onChange={() => setAllModules(false)}
              />
              Only selected modules
            </label>
            {!allModules && (
              <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {modules.map((m) => (
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

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {msg && (
              <span className="text-xs text-muted-foreground">{msg}</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
