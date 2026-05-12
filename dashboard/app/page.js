"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Eye,
  FileText,
  Gauge,
  LogIn,
  MessageSquareText,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  XCircle
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const PAGE_SIZE = 8;
const STAGES = ["DISCOVERED", "ANALYZED", "RESUME_GENERATED", "REVIEW_REQUIRED", "APPLYING", "APPLIED", "FAILED"];
const KEYWORDS = ["Java", "Spring Boot", "C++", "REST APIs", "MySQL", "MongoDB", "Distributed Systems", "Monitoring", "Debugging", "API Optimization"];

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API}${path}`, { cache: "no-store", ...options });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function parseNotes(notes = "") {
  const get = (label) => notes.split("|").find((part) => part.trim().startsWith(label))?.replace(label, "").trim();
  return {
    careerUpside: get("Career upside:") || "Unknown",
    interviewProbability: get("Interview probability:") || "Unknown",
    priority: get("Priority:") || "Low",
    risks: get("Risks:") || "",
    recruiterMessage: get("Recruiter message:") || ""
  };
}

function statusClass(status = "") {
  return `status-${String(status).toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-")}`;
}

function todayKey(value) {
  if (!value) return "";
  return new Date(value).toDateString();
}

function fitColor(score) {
  if (score >= 8.5) return "text-emerald-300";
  if (score >= 7) return "text-cyan-300";
  if (score >= 6) return "text-amber-300";
  return "text-red-300";
}

function Card({ children, className = "" }) {
  return <section className={cx("rounded-lg border border-zinc-800 bg-zinc-950/80 shadow-sm", className)}>{children}</section>;
}

function Button({ children, className = "", variant = "primary", ...props }) {
  const variants = {
    primary: "bg-teal-500 text-zinc-950 hover:bg-teal-400",
    secondary: "border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800",
    ghost: "text-zinc-300 hover:bg-zinc-900",
    danger: "bg-red-500/15 text-red-200 hover:bg-red-500/25"
  };
  return (
    <button className={cx("inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition", variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-50">{value}</p>
          {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2 text-teal-300"><Icon size={18} /></div>
      </div>
    </Card>
  );
}

function JobsTable({ jobs, onSelect }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState({ key: "fit_score", dir: "desc" });
  const [page, setPage] = useState(1);

  const sources = useMemo(() => [...new Set(jobs.map((job) => job.source).filter(Boolean))], [jobs]);
  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    const rows = jobs.filter((job) => {
      const matchesSearch = `${job.company} ${job.role} ${job.compensation_estimate}`.toLowerCase().includes(query);
      const matchesStatus = status === "all" || job.status === status;
      const matchesSource = source === "all" || job.source === source;
      return matchesSearch && matchesStatus && matchesSource;
    });
    rows.sort((a, b) => {
      const av = a[sort.key] || "";
      const bv = b[sort.key] || "";
      const result = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? result : -result;
    });
    return rows;
  }, [jobs, search, status, source, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key) {
    setSort((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : "desc" }));
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-zinc-800 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Jobs Table</h2>
          <p className="text-sm text-zinc-500">Search, filter, sort, and open detailed review.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex h-9 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-400">
            <Search size={15} />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search jobs" className="w-44 bg-transparent text-zinc-100 outline-none" />
          </label>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-9 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100">
            <option value="all">All statuses</option>
            {STAGES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={source} onChange={(event) => { setSource(event.target.value); setPage(1); }} className="h-9 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100">
            <option value="all">All sources</option>
            {sources.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-zinc-900/80 text-xs uppercase text-zinc-500">
            <tr>
              {[
                ["company", "Company"],
                ["role", "Role"],
                ["fit_score", "Fit score"],
                ["compensation_estimate", "Compensation"],
                ["source", "Source"],
                ["status", "Status"],
                ["updated_at", "Created at"]
              ].map(([key, label]) => (
                <th key={key} className="px-4 py-3">
                  <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-zinc-200">
                    {label}<ArrowDownUp size={12} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length > 0 ? (
              visible.map((job) => (
                <tr key={job.id} onClick={() => onSelect(job)} className="cursor-pointer border-t border-zinc-900 hover:bg-zinc-900/70">
                  <td className="px-4 py-3 font-medium text-zinc-100">{job.company}</td>
                  <td className="px-4 py-3 text-zinc-300">{job.role}</td>
                  <td className={cx("px-4 py-3 font-semibold", fitColor(job.fit_score))}>{job.fit_score ?? "-"}</td>
                  <td className="px-4 py-3 text-zinc-400">{job.compensation_estimate || "-"}</td>
                  <td className="px-4 py-3 text-zinc-400">{job.source || "unknown"}</td>
                  <td className="px-4 py-3"><span className={cx("rounded-full px-2 py-1 text-xs", statusClass(job.status))}>{job.status}</span></td>
                  <td className="px-4 py-3 text-zinc-500">{job.updated_at ? new Date(job.updated_at).toLocaleString() : "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="px-4 py-8 text-center text-zinc-500">
                  No jobs discovered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-zinc-800 p-4 text-sm text-zinc-400">
        <span>{filtered.length} jobs</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setPage((value) => Math.max(1, value - 1))}>Prev</Button>
          <span>Page {page} / {totalPages}</span>
          <Button variant="secondary" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</Button>
        </div>
      </div>
    </Card>
  );
}

function StageTracker({ jobs, onSelect }) {
  const grouped = STAGES.map((stage) => ({ stage, jobs: jobs.filter((job) => job.status === stage || (stage === "OA" && job.status === "OA received")) }));
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Application Tracker</h2>
          <p className="text-sm text-zinc-500">Stage view for the active pipeline.</p>
        </div>
        <ClipboardCheck className="text-teal-300" size={20} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {grouped.map((group) => (
          <div key={group.stage} className="min-h-32 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-200">{group.stage}</h3>
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{group.jobs.length}</span>
            </div>
            <div className="space-y-2">
              {group.jobs.slice(0, 3).map((job) => (
                <button key={job.id} onClick={() => onSelect(job)} className="w-full rounded-md border border-zinc-800 bg-zinc-950 p-2 text-left text-xs hover:border-teal-700">
                  <span className="block truncate text-zinc-200">{job.company}</span>
                  <span className="block truncate text-zinc-500">{job.role}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function KeywordMatch({ job }) {
  const text = `${job.jd || ""} ${job.notes || ""}`.toLowerCase();
  const matched = KEYWORDS.filter((keyword) => text.includes(keyword.toLowerCase()));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-zinc-400">Keyword match</span>
        <span className="text-zinc-200">{matched.length}/{KEYWORDS.length}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {KEYWORDS.map((keyword) => (
          <span key={keyword} className={cx("rounded-full px-2 py-1 text-xs", matched.includes(keyword) ? "bg-teal-500/15 text-teal-200" : "bg-zinc-900 text-zinc-500")}>{keyword}</span>
        ))}
      </div>
    </div>
  );
}

function ResumeViewer({ job }) {
  const [tex, setTex] = useState("");
  const resumePath = job?.resume_used || "";
  const isPdf = resumePath.endsWith(".pdf");

  useEffect(() => {
    let ignore = false;
    async function loadTex() {
      setTex("");
      if (!resumePath || isPdf) return;
      try {
        const response = await fetch(`${API}/api/resume?path=${encodeURIComponent(resumePath)}`);
        const text = await response.text();
        if (!ignore) setTex(text);
      } catch {
        if (!ignore) setTex("Resume preview unavailable.");
      }
    }
    loadTex();
    return () => { ignore = true; };
  }, [resumePath, isPdf]);

  if (!job) return null;
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Resume Viewer</h2>
          <p className="text-sm text-zinc-500">Preview generated resume and keyword coverage.</p>
        </div>
        <FileText className="text-teal-300" size={20} />
      </div>
      <KeywordMatch job={job} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <h3 className="mb-2 text-sm font-medium">Active resume</h3>
          {resumePath ? <code className="break-all text-xs text-zinc-400">{resumePath}</code> : <p className="text-sm text-zinc-500">No resume generated yet.</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
            <span className="rounded-full bg-zinc-950 px-2 py-1">Template: {job.resume_template || "none"}</span>
            <span className="rounded-full bg-zinc-950 px-2 py-1">Version: {job.resume_version || "latest"}</span>
          </div>
          {resumePath ? (
            <a href={`${API}/api/resume?path=${encodeURIComponent(resumePath)}`} target="_blank" className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 hover:bg-zinc-800">
              <Eye size={15} />View Resume Used
            </a>
          ) : null}
          {isPdf ? <iframe title="PDF preview" src={`${API}/api/resume?path=${encodeURIComponent(resumePath)}`} className="mt-3 h-80 w-full rounded-md border border-zinc-800" /> : null}
          {!isPdf && tex ? <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-300">{tex}</pre> : null}
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <h3 className="mb-2 text-sm font-medium">Compare variants</h3>
          <div className="space-y-2 text-sm text-zinc-400">
            <p>Current variant: {job.resume_template || "not assigned"}</p>
            <p>Fit-led summary, ATS keywords, and project ordering are compared against the active job description.</p>
            <p className="text-zinc-500">Additional variants appear here when multiple resumes exist for the same company.</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function JobDetails({ job, onPatch }) {
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState("");

  useEffect(() => {
    if (!job) return;
    const parsed = parseNotes(job.notes);
    setMessage(job.recruiter_message || parsed.recruiterMessage || "");
    setSummary(job.resume_summary || "");
  }, [job]);

  if (!job) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Job Details</h2>
        <p className="mt-2 text-sm text-zinc-500">Select a job to inspect JD, fit analysis, resume, outreach, and review actions.</p>
      </Card>
    );
  }

  const parsed = parseNotes(job.notes);
  const jd = job.jd || "JD not stored for this item.";
  const keywords = KEYWORDS.filter((keyword) => jd.toLowerCase().includes(keyword.toLowerCase()));

  async function savePatch(patch) {
    const updated = await fetchJson(`/api/applications/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    onPatch(updated);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm text-teal-300">{job.company}</p>
            <h2 className="text-xl font-semibold text-zinc-50">{job.role}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={cx("rounded-full px-2 py-1 text-xs", statusClass(job.status))}>{job.status}</span>
              <span className={cx("rounded-full bg-zinc-900 px-2 py-1 text-xs", fitColor(job.fit_score))}>Fit {job.fit_score ?? "-"}/10</span>
              <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs text-zinc-400">{job.source || "unknown source"}</span>
            </div>
          </div>
          {job.URL ? <a href={job.URL} target="_blank" className="inline-flex items-center gap-2 text-sm text-teal-300 hover:text-teal-200"><ExternalLink size={15} />Open job</a> : null}
          {job.resume_used ? <a href={`${API}/api/resume?path=${encodeURIComponent(job.resume_used)}`} target="_blank" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><Eye size={15} />View Resume Used</a> : null}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="mb-2 flex items-center gap-2 font-medium"><Gauge size={16} />Fit Analysis</h3>
          <p className="text-sm text-zinc-400">Career upside: {parsed.careerUpside}</p>
          <p className="text-sm text-zinc-400">Interview probability: {parsed.interviewProbability}</p>
          <p className="text-sm text-zinc-400">Priority: {parsed.priority}</p>
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 flex items-center gap-2 font-medium"><Sparkles size={16} />Compensation</h3>
          <p className="text-sm text-zinc-400">{job.compensation_estimate || "No estimate available."}</p>
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 flex items-center gap-2 font-medium"><AlertTriangle size={16} />Risks</h3>
          <p className="text-sm text-zinc-400">{parsed.risks || "No major risk flagged."}</p>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="mb-3 font-medium">Extracted Keywords</h3>
        <div className="flex flex-wrap gap-2">
          {keywords.length ? keywords.map((keyword) => <span key={keyword} className="rounded-full bg-teal-500/15 px-2 py-1 text-xs text-teal-200">{keyword}</span>) : <span className="text-sm text-zinc-500">No tracked keywords matched.</span>}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 font-medium">Manual Review Queue</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm text-zinc-400">Recruiter message</span>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="h-36 w-full rounded-md border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-100 outline-none focus:border-teal-700" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-zinc-400">Resume summary override</span>
            <textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Optional summary edit before regenerating resume" className="h-36 w-full rounded-md border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-100 outline-none focus:border-teal-700" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => savePatch({ status: "shortlisted", review_decision: "approved", recruiter_message: message, resume_summary: summary })}><CheckCircle2 size={16} />Approve</Button>
          <Button variant="danger" onClick={() => savePatch({ status: "rejected", review_decision: "rejected", recruiter_message: message, resume_summary: summary })}><XCircle size={16} />Reject</Button>
          <Button variant="secondary" onClick={() => savePatch({ recruiter_message: message, resume_summary: summary })}>Save edits</Button>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 font-medium">Full JD</h3>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-950 p-3 text-sm text-zinc-400">{jd.replace(/&lt;[^&]*&gt;/g, " ")}</pre>
      </Card>
    </div>
  );
}

function HealthPanel({ health }) {
  const failures = health?.failures || [];
  const sessions = health?.sessions || [];
  const ollama = health?.ollama || {};
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Scheduler Health</h2>
          <p className="text-sm text-zinc-500">Polling backend health, logs, Ollama, and session state.</p>
        </div>
        <Activity className="text-teal-300" size={20} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
          <p className="text-xs text-zinc-500">Last run</p>
          <p className="mt-1 text-sm text-zinc-200">{health?.last_run?.ts ? new Date(health.last_run.ts).toLocaleString() : "No run yet"}</p>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
          <p className="text-xs text-zinc-500">Jobs discovered</p>
          <p className="mt-1 text-sm text-zinc-200">{health?.jobs_discovered ?? 0}</p>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
          <p className="text-xs text-zinc-500">Ollama latency</p>
          <p className="mt-1 text-sm text-zinc-200">{ollama.latency_ms ? `${ollama.latency_ms} ms` : health?.ollama_latency_ms ? `${health.ollama_latency_ms} ms` : "No inference logged"}</p>
          <p className={cx("mt-1 text-xs", ollama.daemon && ollama.model_available ? "text-emerald-300" : "text-amber-300")}>
            {ollama.daemon ? "daemon online" : "daemon offline"} / {ollama.model_available ? "model ready" : "model missing"}
          </p>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
          <p className="text-xs text-zinc-500">Failures</p>
          <p className="mt-1 text-sm text-zinc-200">{failures.length}</p>
        </div>
      </div>
      <div className="mt-4">
        <h3 className="mb-3 text-sm font-medium">Browser Session Manager</h3>
        <div className="grid gap-3 md:grid-cols-3">
        {sessions.map((item) => (
          <div key={item.platform} className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium capitalize">{item.platform}</p>
                <p className={cx("text-xs", item.logged_in ? "text-emerald-300" : "text-zinc-500")}>{item.status}</p>
                <p className="mt-1 text-xs text-zinc-600">Last active: {item.last_active ? new Date(item.last_active).toLocaleString() : "never"}</p>
                {item.captcha_warning ? <p className="mt-1 text-xs text-amber-300">Captcha warning</p> : null}
              </div>
              <div className="flex flex-col gap-2 items-end">
                {item.platform === "linkedin" && (
                  <Button variant="primary" onClick={async () => {
                    try {
                      const result = await fetchJson("/api/browser/login/linkedin", { method: "POST" });
                      alert(result.message || "Opened browser");
                    } catch (err) {
                      alert(err.message);
                    }
                  }}>
                    <LogIn size={15} /> Login LinkedIn
                  </Button>
                )}
                <Button variant="secondary" onClick={async () => {
                  const result = await fetchJson(`/api/sessions/${item.platform}/relogin`, { method: "POST" });
                  alert(result.message);
                }}><LogIn size={15} />Relogin</Button>
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>
      {health?.captcha_warnings?.length ? (
        <div className="mt-4 rounded-md border border-amber-900 bg-amber-500/10 p-3 text-sm text-amber-200">
          Captcha warnings detected. Pause browser automation and refresh sessions manually.
        </div>
      ) : null}
    </Card>
  );
}

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [health, setHealth] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [applications, status] = await Promise.all([
        fetchJson("/api/applications"),
        fetchJson("/api/health/status")
      ]);
      setJobs(applications);
      setHealth(status);
      setSelected((current) => current ? applications.find((job) => job.id === current.id) || current : applications[0] || null);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, []);

  const today = new Date().toDateString();
  const todayJobs = jobs.filter((job) => todayKey(job.updated_at) === today);
  const avgFit = jobs.length ? (jobs.reduce((sum, job) => sum + Number(job.fit_score || 0), 0) / jobs.length).toFixed(1) : "0.0";
  const highPriority = jobs.filter((job) => Number(job.fit_score || 0) >= 8).length;
  const outreachCount = jobs.filter((job) => job.recruiter_message || job.notes?.includes("Recruiter message:")).length;

  function patchSelected(updated) {
    setJobs((items) => items.map((job) => job.id === updated.id ? updated : job));
    setSelected(updated);
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100 lg:p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-teal-900 bg-teal-500/10 px-3 py-1 text-xs text-teal-200">
              <Bot size={14} /> Local Ollama job automation
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Application Management</h1>
            <p className="mt-1 text-sm text-zinc-500">Review high-fit backend roles, resumes, outreach, and scheduler health from one workflow surface.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={refresh}><Activity size={16} />Refresh</Button>
            <Button onClick={() => {
              alert("Discovery pipeline started! This will take a few minutes. Check the backend terminal for live progress logs.");
              fetchJson("/api/runs/live", { method: "POST" })
                .then(() => alert("Discovery run complete!"))
                .catch((e) => alert("Discovery failed: " + e.message));
            }}><Send size={16} />Run discovery</Button>
          </div>
        </header>

        {error ? <div className="rounded-md border border-red-900 bg-red-500/10 p-3 text-sm text-red-200">Backend unavailable: {error}</div> : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <StatCard icon={BriefcaseBusiness} label="Jobs scanned today" value={todayJobs.length} hint="From tracker updates" />
          <StatCard icon={Sparkles} label="Review Required" value={jobs.filter((job) => job.status === "REVIEW_REQUIRED").length} />
          <StatCard icon={CheckCircle2} label="Applied" value={jobs.filter((job) => job.status === "APPLIED").length} />
          <StatCard icon={Gauge} label="Avg fit score" value={avgFit} />
          <StatCard icon={ShieldAlert} label="High priority" value={highPriority} hint="Fit >= 8" />
          <StatCard icon={MessageSquareText} label="Outreach count" value={outreachCount} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(460px,0.9fr)]">
          <div className="space-y-6">
            <JobsTable jobs={jobs} onSelect={setSelected} />
            <StageTracker jobs={jobs} onSelect={setSelected} />
            <ResumeViewer job={selected} />
            <HealthPanel health={health} />
          </div>
          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <JobDetails job={selected} onPatch={patchSelected} />
          </aside>
        </div>
      </div>
    </main>
  );
}
