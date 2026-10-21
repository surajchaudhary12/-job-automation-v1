"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, BriefcaseBusiness, Check, ExternalLink, Search, Settings2, Sparkles } from "lucide-react";

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
  if (APPLIED.has(value)) return "bg-emerald-50 text-emerald-700";
  if (value === "REVIEW_REQUIRED" || value === "FAILED") return "bg-amber-50 text-amber-800";
  if (value === "APPLYING") return "bg-blue-50 text-blue-700";
  return "bg-stone-100 text-stone-600";
}

function JobCard({ job, applying, onApply }) {
  const status = String(job.status || "DISCOVERED").toUpperCase();
  const isApplied = APPLIED.has(status);
  const isReview = status === "REVIEW_REQUIRED";
  const isApplying = applying || status === "APPLYING";
  const actionLabel = isApplied ? "Applied" : isReview ? "Review" : isApplying ? "Working…" : status === "FAILED" ? "Try again" : "Apply";

  return (
    <article className="job-card">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/jobs/${job.id}`} className="job-title">{job.role || "Untitled role"}</Link>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle(status)}`}>{statusLabel(status)}</span>
        </div>
        <p className="mt-1.5 text-sm text-stone-600">{job.company || "Company not listed"}{job.location ? <span> · {job.location}</span> : null}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${Number(job.fit_score || 0) >= 7 ? "bg-emerald-500" : "bg-stone-300"}`} />{job.fit_score == null ? "Fit not scored" : `Fit ${Number(job.fit_score).toFixed(1)} / 10`}</span>
          {job.compensation_estimate ? <span>{job.compensation_estimate}</span> : null}
          {job.source ? <span className="capitalize">{job.source}</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {job.URL ? <a href={job.URL} target="_blank" rel="noreferrer" aria-label={`Open ${job.role} at ${job.company}`} className="icon-button"><ExternalLink size={16} /></a> : null}
        <button
          type="button"
          disabled={isApplied || isApplying}
          onClick={() => isReview ? window.location.assign(`/jobs/${job.id}`) : onApply(job)}
          className={`action-button ${isApplied ? "action-done" : isReview ? "action-secondary" : "action-primary"}`}
        >
          {isApplied ? <Check size={15} /> : null}{actionLabel}{!isApplied && !isApplying && !isReview ? <ArrowRight size={15} /> : null}
        </button>
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

  const reviewCount = useMemo(() => jobs.filter((job) => NEEDS_REVIEW.has(String(job.status).toUpperCase())).length, [jobs]);
  const appliedCount = useMemo(() => jobs.filter((job) => APPLIED.has(String(job.status).toUpperCase())).length, [jobs]);
  const visibleJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const status = String(job.status || "DISCOVERED").toUpperCase();
      const matchesFilter = filter === "for-you" ? NEEDS_REVIEW.has(status) : APPLIED.has(status);
      const matchesSearch = !query || `${job.company} ${job.role} ${job.location}`.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    }).sort((left, right) => Number(right.fit_score || 0) - Number(left.fit_score || 0));
  }, [jobs, filter, search]);

  async function findJobs() {
    setBusy(true); setMessage(""); setError("");
    try {
      await request("/api/runs/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 25, prepareApply: false, autoSubmit: false }) });
      await refresh(); setMessage("Search complete. Your jobs are up to date.");
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  async function applyToJob(job) {
    setApplyingId(job.id); setError(""); setMessage(`Preparing your application for ${job.company}…`);
    try {
      await request("/api/runs/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id, limit: 1, prepareApply: true, autoSubmit: true }) });
      await refresh(); setMessage(`Application run finished for ${job.company}. Check its status for the result.`);
    } catch (reason) { setError(reason.message); }
    finally { setApplyingId(""); }
  }

  return (
    <main className="min-h-screen bg-[#f7f8f5] px-4 py-5 text-stone-900 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-white"><Sparkles size={15} /></span>Rolepath</Link>
          <Link href="/settings" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-stone-600 transition hover:bg-white hover:text-stone-900"><Settings2 size={15} /><span>Preferences</span></Link>
        </header>

        <section className="mb-9 flex flex-col gap-5 border-b border-stone-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-emerald-700">Your job search</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">A better next step.</h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-stone-600">Find roles that fit, then review and apply from one place.</p>
            <p className="mt-4 text-sm text-stone-500"><strong className="font-semibold text-stone-800">{reviewCount}</strong> to review <span className="mx-2 text-stone-300">·</span> <strong className="font-semibold text-stone-800">{appliedCount}</strong> applied{lastRun ? <span className="text-stone-400"> <span className="mx-2 text-stone-300">·</span> Updated {new Date(lastRun).toLocaleDateString()}</span> : null}</p>
          </div>
          <button type="button" onClick={findJobs} disabled={busy} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"><Search size={16} />{busy ? "Finding jobs…" : "Find jobs"}</button>
        </section>

        <section>
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5 border-b border-stone-200">
              {[ ["for-you", "To review", reviewCount], ["applied", "Applied", appliedCount] ].map(([value, label, count]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} className={`relative pb-3 text-sm font-medium transition ${filter === value ? "text-stone-900" : "text-stone-500 hover:text-stone-800"}`}>
                  {label}<span className={`ml-2 text-xs ${filter === value ? "text-stone-500" : "text-stone-400"}`}>{count}</span>{filter === value ? <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full bg-emerald-700" /> : null}
                </button>
              ))}
            </div>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-400 focus-within:border-emerald-700 sm:w-64"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search jobs" className="w-full bg-transparent text-stone-800 outline-none placeholder:text-stone-400" /></label>
          </div>

          {message ? <p role="status" className="mb-4 text-sm text-stone-600">{message}</p> : null}
          {error ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
          {visibleJobs.length ? <div className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">{visibleJobs.map((job) => <JobCard key={job.id} job={job} applying={applyingId === job.id} onApply={applyToJob} />)}</div> : (
            <div className="rounded-xl border border-dashed border-stone-300 bg-white/70 px-6 py-16 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-stone-500"><BriefcaseBusiness size={19} /></div>
              <h2 className="mt-4 font-medium text-stone-800">{filter === "applied" ? "Your applications will appear here" : search ? "No matching jobs" : "No jobs to review yet"}</h2>
              <p className="mt-1.5 text-sm text-stone-500">{filter === "applied" ? "Once you apply, you can follow progress here." : "Search for roles that match your experience."}</p>
              {filter === "for-you" && !search ? <button type="button" onClick={findJobs} disabled={busy} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-900">{busy ? "Finding jobs…" : "Find jobs"}<ArrowDownRight size={15} /></button> : null}
            </div>
          )}
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400"><span>Applications pause when a CAPTCHA or a question needs your input.</span><Link href="/settings" className="hover:text-stone-600">Preferences</Link></footer>
      </div>
    </main>
  );
}
