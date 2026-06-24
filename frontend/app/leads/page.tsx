"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@/components/Alert";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Input from "@/components/Input";
import {
  ApiError,
  UnauthorizedError,
  downloadResume,
  getMe,
  listLeads,
  updateLeadState,
} from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import type { CurrentUser, LeadRead, LeadState } from "@/lib/types";
import { useDebounce } from "@/lib/useDebounce";
import { formatDate, fullName } from "@/lib/utils";

const PAGE_SIZE = 10;

type StateFilter = "ALL" | LeadState;

const FILTERS: { value: StateFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "REACHED_OUT", label: "Reached out" },
];

export default function LeadsPage() {
  const router = useRouter();
  // `null` = checking (server + first client render agree on a spinner),
  // `true`/`false` = resolved after reading the token client-side.
  const [authReady, setAuthReady] = useState<boolean | null>(null);

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [leads, setLeads] = useState<LeadRead[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<StateFilter>("ALL");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    clearToken();
    router.replace("/login");
  }, [router]);

  // Resolve auth client-side (localStorage is unavailable during SSR, so the
  // token can only be read after mount — this is a deliberate sync with an
  // external system, not derived render state).
  useEffect(() => {
    if (getToken()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthReady(true);
    } else {
      setAuthReady(false);
      router.replace("/login");
    }
  }, [router]);

  // Load the current attorney once.
  useEffect(() => {
    if (authReady !== true) return;
    let cancelled = false;
    getMe()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch((err) => {
        if (err instanceof UnauthorizedError) handleUnauthorized();
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, handleUnauthorized]);

  // Fetch leads on any query change.
  useEffect(() => {
    if (authReady !== true) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listLeads({
          state: filter === "ALL" ? undefined : filter,
          search: debouncedSearch.trim() || undefined,
          limit: PAGE_SIZE,
          offset,
        });
        if (cancelled) return;
        setLeads(data.items);
        setTotal(data.total);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          handleUnauthorized();
        } else if (err instanceof ApiError) {
          setError(err.detail);
        } else {
          setError("Failed to load leads. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authReady, filter, debouncedSearch, offset, handleUnauthorized]);

  async function handleMarkReachedOut(lead: LeadRead) {
    setBusyId(lead.id);
    setError(null);
    try {
      const updated = await updateLeadState(lead.id, "REACHED_OUT");
      setLeads((prev) =>
        prev.map((l) => (l.id === updated.id ? updated : l)),
      );
    } catch (err) {
      if (err instanceof UnauthorizedError) handleUnauthorized();
      else if (err instanceof ApiError) setError(err.detail);
      else setError("Could not update the lead. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownload(lead: LeadRead) {
    setBusyId(lead.id);
    setError(null);
    try {
      await downloadResume(lead);
    } catch (err) {
      if (err instanceof UnauthorizedError) handleUnauthorized();
      else if (err instanceof ApiError) setError(err.detail);
      else setError("Could not download the resume. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  if (authReady !== true) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      </div>
    );
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              A
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate-900">
              Alma
            </span>
            <span className="ml-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              Lead console
            </span>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="hidden text-sm text-slate-600 sm:inline">
                Signed in as{" "}
                <span className="font-medium text-slate-900">{user.name}</span>
              </span>
            )}
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>
          <p className="mt-1 text-sm text-slate-500">
            Prospects who submitted the intake form.
          </p>
        </div>

        {/* Controls */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setFilter(f.value);
                  setOffset(0);
                }}
                className={
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                  (filter === f.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="sm:w-72">
            <Input
              id="search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              placeholder="Search by name or email…"
            />
          </div>
        </div>

        {error && (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Submitted</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center">
                      <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-16 text-center text-sm text-slate-500"
                    >
                      No leads match your filters yet.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                        {fullName(lead)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                        {lead.email}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                        {formatDate(lead.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <Badge state={lead.state} />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busyId === lead.id}
                            onClick={() => handleDownload(lead)}
                          >
                            Download resume
                          </Button>
                          {lead.state === "PENDING" && (
                            <Button
                              size="sm"
                              loading={busyId === lead.id}
                              onClick={() => handleMarkReachedOut(lead)}
                            >
                              Mark as reached out
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {total === 0
              ? "No results"
              : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={offset === 0 || loading}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              Previous
            </Button>
            <span className="px-1 text-sm text-slate-500">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={offset + PAGE_SIZE >= total || loading}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={
        "px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 " +
        className
      }
    >
      {children}
    </th>
  );
}
