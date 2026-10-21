"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, BriefcaseBusiness, Check, ExternalLink, Search, Settings2, Sparkles } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const APPLIED = new Set(["APPLIED", "OA_RECEIVED", "INTERVIEW", "OFFER"]);
const NEEDS_REVIEW = new Set(["REVIEW_REQUIRED", "FAILED", "DISCOVERED", "ANALYZED", "RESUME_GENERATED", "APPLYING"]);

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { cache: "no-store", ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

function statusLabel(status = "DISCOVERED") {
  return String(status).toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusStyle(status = "") {
  const value = String(status).toUpperCase();
  if (APPLIED.has(value)) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (value === "REVIEW_REQUIRED" || value === "FAILED") return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  if (value === "APPLYING") return "border-sky-400/20 bg-sky-400/10 text-sky-200";
  return "border-zinc-700 bg-zinc-800/70 text-zinc-300";
}

function fitStyle(score) {
  const value = Number(score || 0);
  if (value >= 8) return "text-emerald-300";
  if (value >= 6.5) return "text-teal-300";
  return "text-zinc-400";
}

function JobCard({ job, applying, onApply }) {
  const status = String(job.status || "DISCOVERED").toUpperCase();
  const isApplied = APPLIED.has(status);
  const isReview = status === "REVIEW_REQUIRED";
  const isApplying = applying || status === "APPLYING";
  const actionLabel = isApplied ? "Applied" : isReview ? "Review" : isApplying ? "Working…" : status === "FAILED" ? "Try again" : "Apply";

  return (
    <article className="group rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4 transition hover:border-zinc-700 hover:bg-zinc-900 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-teal-300">
            <BriefcaseBusiness size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/jobs/${job.id}`} className="truncate font-semibold text-zinc-100 transition hover:text-teal-200">{job.role || "Untitled role"}</Link>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusStyle(status)}`}>{statusLabel(status)}</span>
            </div>
            <p className="mt-1 truncate text-sm text-zinc-400">{job.company || "Company not listed"}{job.location ? ` · ${job.location}` : ""}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span className={fitStyle(job.fit_score)}>{job.fit_score == null ? "Fit not scored" : `Fit ${Number(job.fit_score).toFixed(1)} / 10`}</span>
              {job.compensation_estimate ? <span>{job.compensation_estimate}</span> : null}
              {job.source ? <span className="capitalize">{job.source}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:pl-2">
          {job.URL ? (
            <a href={job.URL} target="_blank" rel="noreferrer" aria-label={`Open ${job.role} at ${job.company}`} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-700 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100">
              <ExternalLink size={16} />
            </a>
          ) : null}
          <button
            type="button"
            disabled={isApplied || isApplying}
            onClick={() => isReview ? window.location.assign(`/jobs/${job.id}`) : onApply(job)}
            className={`inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${isApplied ? "cursor-default border border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : isReview ? "border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700" : "bg-teal-400 text-zinc-950 hover:bg-teal-300 disabled:cursor-wait disabled:opacity-60"}`}
          >
            {isApplied ? <Check size={16} /> : null}{actionLabel}{!isApplied && !isApplying && !isReview ? <ArrowRight size={15} /> : null}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState("for-you");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [applyingId, setApplyingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState(null);

  const refresh = useCallback(async () => {
    const [applications, health] = await Promise.all([request("/api/jobs"), request("/api/health/status")]);
    setJobs(applications);
    setLastRun(health?.last_run?.ts || null);
    setError("");
  }, []);

  useEffect(() => {
    refresh().catch((reason) => setError(reason.message));
    const timer = setInterval(() => refresh().catch((reason) => setError(reason.message)), 20_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const counts = useMemo(() => ({
    applied: jobs.filter((job) => APPLIED.has(String(job.status).toUpperCase())).length,
    review: jobs.filter((job) => NEEDS_REVIEW.has(String(job.status).toUpperCase())).length
  }), [jobs]);

  const visibleJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const status = String(job.status || "DISCOVERED").toUpperCase();
      const matchesFilter = filter === "for-you" ? NEEDS_REVIEW.has(status) : filter === "applied" ? APPLIED.has(status) : true;
      const matchesSearch = !query || `${job.company} ${job.role} ${job.location}`.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    }).sort((left, right) => Number(right.fit_score || 0) - Number(left.fit_score || 0));
  }, [jobs, filter, search]);

  async function findJobs() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await request("/api/runs/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 25, prepareApply: false, autoSubmit: false })
      });
      await refresh();
      setMessage("Search complete. Your job list is up to date.");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function applyToJob(job) {
    setApplyingId(job.id);
    setError("");
    setMessage(`Preparing your application for ${job.company}…`);
    try {
      await request("/api/runs/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, limit: 1, prepareApply: true, autoSubmit: true })
      });
      await refresh();
      setMessage(`Application run finished for ${job.company}. Check its status for the result.`);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setApplyingId("");
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0d0c] px-4 py-6 text-zinc-100 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-200">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-400 text-zinc-950"><Sparkles size={16} /></span>
            JOB SEARCH
          </Link>
          <Link href="/settings" className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-800 px-3 text-sm text-zinc-300 transition hover:bg-zinc-900 hover:text-white">
            <Settings2 size={16} /><span className="hidden sm:inline">Preferences</span>
          </Link>
        </header>

        <section className="mb-8 rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <p className="mb-3 text-sm font-medium text-teal-300">Your next role, in one place</p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Find jobs that fit.</h1>
              <p className="mt-3 text-sm leading-6 text-zinc-400">Search for relevant roles, review the match, and apply when you’re ready.</p>
            </div>
            <button type="button" onClick={findJobs} disabled={busy} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-400 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-300 disabled:cursor-wait disabled:opacity-60">
              <Search size={17} />{busy ? "Searching…" : "Find jobs"}
            </button>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-zinc-800 pt-4 text-sm text-zinc-500">
            <span><strong className="font-semibold text-zinc-200">{jobs.length}</strong> jobs</span>
            <span><strong className="font-semibold text-zinc-200">{counts.review}</strong> to review</span>
            <span><strong className="font-semibold text-zinc-200">{counts.applied}</strong> applied</span>
            <span className="inline-flex items-center gap-1.5"><Activity size={14} />{lastRun ? `Updated ${new Date(lastRun).toLocaleString()}` : "Not searched yet"}</span>
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Your jobs</h2>
              <p className="mt-1 text-sm text-zinc-500">Sorted by fit for your profile.</p>
            </div>
            <label className="flex h-10 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 text-sm text-zinc-500 focus-within:border-zinc-600">
              <Search size={15} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search roles or companies" className="w-full bg-transparent text-zinc-100 outline-none sm:w-52" />
            </label>
          </div>

          <div className="mb-4 flex gap-1 rounded-xl bg-zinc-900/70 p-1 sm:w-fit">
            {[["for-you", "For you"], ["all", "All jobs"], ["applied", "Applied"]].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-4 py-2 text-sm transition ${filter === value ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-100"}`}>{label}</button>
            ))}
          </div>

          {message ? <p role="status" className="mb-3 text-sm text-zinc-400">{message}</p> : null}
          {error ? <p role="alert" className="mb-3 rounded-xl border border-red-900/70 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}

          {visibleJobs.length ? (
            <div className="space-y-3">
              {visibleJobs.map((job) => <JobCard key={job.id} job={job} applying={applyingId === job.id} onApply={applyToJob} />)}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-500"><BriefcaseBusiness size={20} /></div>
              <h3 className="mt-4 font-medium text-zinc-200">{filter === "applied" ? "No applications yet" : "No jobs here yet"}</h3>
              <p className="mt-2 text-sm text-zinc-500">{filter === "applied" ? "Applications you submit will show up here." : "Run a search and matching roles will appear here."}</p>
              {filter !== "applied" ? <button type="button" onClick={findJobs} disabled={busy} className="mt-5 text-sm font-medium text-teal-300 hover:text-teal-200">{busy ? "Searching…" : "Find jobs →"}</button> : null}
            </div>
          )}
        </section>

        <footer className="mt-10 flex flex-col gap-2 border-t border-zinc-900 pt-5 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
          <span>Applications pause for CAPTCHA or questions that need your input.</span>
          <Link href="/settings" className="text-zinc-400 hover:text-zinc-200">Application preferences <ArrowRight className="ml-1 inline" size={12} /></Link>
        </footer>
      </div>
    </main>
  );
}
