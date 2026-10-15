"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  FileImage,
  FileText,
  RefreshCcw,
  Sparkles
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API}${path}`, { cache: "no-store", ...options });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function Card({ children, className = "" }) {
  return <section className={cx("rounded-xl border border-zinc-800 bg-zinc-950/80 shadow-sm", className)}>{children}</section>;
}

function Button({ children, className = "", variant = "primary", ...props }) {
  const variants = {
    primary: "bg-teal-500 text-zinc-950 hover:bg-teal-400",
    secondary: "border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800",
    ghost: "text-zinc-300 hover:bg-zinc-900"
  };
  return (
    <button className={cx("inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition", variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </Card>
  );
}

function cleanRole(role = "") {
  return String(role).split("\n").find(Boolean) || String(role);
}

function formatDate(value) {
  if (!value) return "Not applied";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function JobRow({ job, selected, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={cx(
        "w-full rounded-lg border p-3 text-left transition",
        selected ? "border-teal-700 bg-teal-500/10" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-100">{job.company}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{cleanRole(job.role)}</p>
        </div>
        <span className="rounded-full bg-zinc-950 px-2 py-1 text-[11px] text-zinc-400">{job.source || "unknown"}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-500">
        <span className="rounded-full bg-zinc-950 px-2 py-1">{job.fit_score ?? "-"} / 10</span>
        <span className="rounded-full bg-zinc-950 px-2 py-1">{formatDate(job.updated_at)}</span>
        <span className="rounded-full bg-zinc-950 px-2 py-1">{job.application_screenshot_url ? "Screenshot saved" : "No screenshot yet"}</span>
      </div>
    </button>
  );
}

export default function AppliedJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const applications = await fetchJson("/api/applications");
      setJobs(applications);
      setSelectedId((current) => current || applications.find((job) => job.status === "APPLIED")?.id || "");
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const appliedJobs = useMemo(
    () => jobs.filter((job) => String(job.status || "").toUpperCase() === "APPLIED"),
    [jobs]
  );
  const readyJobs = useMemo(
    () => jobs.filter((job) => ["REVIEW_REQUIRED", "RESUME_GENERATED", "APPLYING"].includes(String(job.status || "").toUpperCase())),
    [jobs]
  );
  const selected = appliedJobs.find((job) => job.id === selectedId) || appliedJobs[0] || null;
  const screenshotCount = appliedJobs.filter((job) => job.application_screenshot_url).length;

  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100 lg:p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-teal-900 bg-teal-500/10 px-3 py-1 text-xs text-teal-200">
              <CheckCircle2 size={14} /> Applied history
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Applied Jobs</h1>
            <p className="mt-1 text-sm text-zinc-500">Review what was applied, reopen the screenshot, and jump back to jobs that are ready to submit.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push("/")}>
              <ArrowLeft size={16} /> Back to dashboard
            </Button>
            <Button variant="secondary" onClick={refresh}>
              <RefreshCcw size={16} /> Refresh
            </Button>
          </div>
        </header>

        {error ? <div className="rounded-md border border-red-900 bg-red-500/10 p-3 text-sm text-red-200">Backend unavailable: {error}</div> : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Applied jobs" value={appliedJobs.length} hint="Confirmed submissions" />
          <StatCard label="Screenshots saved" value={screenshotCount} hint="Easy revisit trail" />
          <StatCard label="Ready to apply" value={readyJobs.length} hint="Review-required queue" />
          <StatCard label="Latest applied" value={appliedJobs[0] ? cleanRole(appliedJobs[0].role).slice(0, 18) : "None"} hint={appliedJobs[0]?.company || "No applied job yet"} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Applied Queue</h2>
                <p className="text-sm text-zinc-500">Tap any card to revisit the confirmation screenshot.</p>
              </div>
              <FileImage className="text-teal-300" size={20} />
            </div>
            <div className="space-y-3">
              {appliedJobs.length ? appliedJobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  selected={job.id === selected?.id}
                  onSelect={() => setSelectedId(job.id)}
                />
              )) : (
                <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
                  No applied jobs yet. Once a job submits, its screenshot will show here.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Applied Details</h2>
                <p className="text-sm text-zinc-500">Resume, screenshot, and source link for the selected submission.</p>
              </div>
              <FileText className="text-teal-300" size={20} />
            </div>

            {selected ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <p className="text-sm text-teal-300">{selected.company}</p>
                  <h3 className="mt-1 text-2xl font-semibold">{cleanRole(selected.role)}</h3>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                    <span className="rounded-full bg-zinc-950 px-2 py-1">Status: {selected.status}</span>
                    <span className="rounded-full bg-zinc-950 px-2 py-1">Fit: {selected.fit_score ?? "-"}/10</span>
                    <span className="rounded-full bg-zinc-950 px-2 py-1">Source: {selected.source || "unknown"}</span>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <a href={selected.URL || selected.url || "#"} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 hover:bg-zinc-800">
                    <ExternalLink size={15} /> Open job
                  </a>
                  {selected.resume_preview_url ? (
                    <a href={selected.resume_preview_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 hover:bg-zinc-800">
                      <Eye size={15} /> View resume
                    </a>
                  ) : null}
                  {selected.application_screenshot_url ? (
                    <a href={selected.application_screenshot_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-teal-700 bg-teal-500/10 px-3 text-sm text-teal-200 hover:bg-teal-500/20">
                      <Download size={15} /> Open screenshot
                    </a>
                  ) : (
                    <div className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-500">
                      <Clock3 size={15} /> Screenshot not saved
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-medium">Application screenshot</h4>
                    <span className="text-xs text-zinc-500">{selected.application_screenshot_url ? "Saved for revisit" : "Capture unavailable"}</span>
                  </div>
                  {selected.application_screenshot_url ? (
                    <a href={selected.application_screenshot_url} target="_blank" rel="noreferrer">
                      <img
                        src={selected.application_screenshot_url}
                        alt={`${selected.company} application screenshot`}
                        className="max-h-[560px] w-full rounded-lg border border-zinc-800 object-contain"
                      />
                    </a>
                  ) : (
                    <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950 text-sm text-zinc-500">
                      No screenshot stored for this application yet.
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <h4 className="mb-2 text-sm font-medium">Notes</h4>
                  <p className="whitespace-pre-wrap text-sm text-zinc-400">{selected.notes || "No notes stored."}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-sm text-zinc-500">
                Select an applied job to view its screenshot and resume trail.
              </div>
            )}
          </Card>
        </div>

        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Ready to Apply</h2>
              <p className="text-sm text-zinc-500">A small queue of jobs waiting for your review before submit.</p>
            </div>
            <Sparkles className="text-teal-300" size={20} />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {readyJobs.slice(0, 8).map((job) => (
              <button
                key={job.id}
                onClick={() => router.push(`/jobs/${job.id}`)}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-left hover:border-teal-700"
              >
                <p className="text-sm font-medium text-zinc-100">{job.company}</p>
                <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{cleanRole(job.role)}</p>
                <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
                  <span>{job.status}</span>
                  <span>Fit {job.fit_score ?? "-"}/10</span>
                </div>
              </button>
            ))}
            {!readyJobs.length ? (
              <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-500">
                No jobs are currently queued for review.
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </main>
  );
}
