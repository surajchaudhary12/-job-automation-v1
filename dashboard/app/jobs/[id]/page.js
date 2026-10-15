"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Gauge,
  Sparkles,
  XCircle
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
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
    <button className={cx("inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition disabled:opacity-50", variants[variant], className)} {...props}>
      {children}
    </button>
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

function ResumeViewer({ job, onCompiled }) {
  const [tex, setTex] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);
  const [compiledPdfPath, setCompiledPdfPath] = useState("");
  const [compiledPdfUrl, setCompiledPdfUrl] = useState("");
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

  useEffect(() => () => {
    if (compiledPdfUrl) window.URL.revokeObjectURL(compiledPdfUrl);
  }, [compiledPdfUrl]);

  async function handleCompileAndDownload() {
    setIsCompiling(true);
    try {
      const response = await fetch(`${API}/api/resume/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job })
      });
      if (!response.ok) throw new Error("Compilation failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const savedPath = response.headers.get("X-Resume-Pdf-Path");
      if (savedPath) {
        window.URL.revokeObjectURL(url);
        setCompiledPdfPath(savedPath);
        onCompiled?.(savedPath);
      } else {
        setCompiledPdfUrl(url);
      }
      const a = document.createElement("a");
      a.href = savedPath
        ? `${API}/api/resume?path=${encodeURIComponent(savedPath)}&download=1`
        : url;
      a.download = `Suraj_Resume_${job.company.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      a.click();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsCompiling(false);
    }
  }

  if (!job) return null;
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Resume Viewer</h2>
          <p className="text-sm text-zinc-500">Preview generated resume and compile to PDF.</p>
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
          <div className="mt-4 flex flex-wrap gap-2">
            {resumePath ? (
              <a href={`${API}/api/resume?path=${encodeURIComponent(resumePath)}`} target="_blank" download className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 hover:bg-zinc-800">
                <Download size={15} />Download Original File
              </a>
            ) : null}
            <Button onClick={handleCompileAndDownload} disabled={isCompiling}>
              <Download size={15} />
              {isCompiling ? "Compiling PDF..." : "Compile & Download PDF"}
            </Button>
          </div>
          {compiledPdfPath ? <iframe title="PDF preview" src={`${API}/api/resume?path=${encodeURIComponent(compiledPdfPath)}`} className="mt-3 h-80 w-full rounded-md border border-zinc-800" /> : null}
          {!compiledPdfPath && compiledPdfUrl ? <iframe title="PDF preview" src={compiledPdfUrl} className="mt-3 h-80 w-full rounded-md border border-zinc-800" /> : null}
          {!compiledPdfPath && !compiledPdfUrl && isPdf ? <iframe title="PDF preview" src={`${API}/api/resume?path=${encodeURIComponent(resumePath)}`} className="mt-3 h-80 w-full rounded-md border border-zinc-800" /> : null}
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

export default function JobDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState("");

  useEffect(() => {
    async function loadJob() {
      try {
        const data = await fetchJson(`/api/applications/${id}`);
        setJob(data);
        const parsed = parseNotes(data.notes);
        setMessage(data.recruiter_message || parsed.recruiterMessage || "");
        setSummary(data.resume_summary || "");
      } catch (err) {
        setError(err.message);
      }
    }
    loadJob();
  }, [id]);

  async function savePatch(patch) {
    try {
      const updated = await fetchJson(`/api/applications/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      setJob(updated);
      alert("Changes saved!");
    } catch (err) {
      alert("Failed to save: " + err.message);
    }
  }

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
        <Button variant="ghost" onClick={() => router.push("/")} className="mb-4"><ArrowLeft size={16}/> Back</Button>
        <div className="rounded-md border border-red-900 bg-red-500/10 p-4 text-red-200">Error loading job: {error}</div>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
        <p className="text-zinc-500">Loading job details...</p>
      </main>
    );
  }

  const parsed = parseNotes(job.notes);
  const jd = job.jd || "JD not stored for this item.";
  const keywords = KEYWORDS.filter((keyword) => jd.toLowerCase().includes(keyword.toLowerCase()));

  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100 lg:p-6">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="flex items-center gap-4">
          <Button variant="secondary" onClick={() => router.push("/")}>
            <ArrowLeft size={16}/> Back to Dashboard
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Job Review: {job.company}</h1>
        </header>

        <div className="grid gap-6">
          <Card className="p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm text-teal-300">{job.company}</p>
                <h2 className="text-2xl font-semibold text-zinc-50">{job.role}</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={cx("rounded-full px-2 py-1 text-xs", statusClass(job.status))}>{job.status}</span>
                  <span className={cx("rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold", fitColor(job.fit_score))}>Fit {job.fit_score ?? "-"}/10</span>
                  <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-zinc-400">{job.source || "unknown source"}</span>
                </div>
              </div>
              {job.URL ? <a href={job.URL} target="_blank" className="inline-flex items-center gap-2 text-sm text-teal-300 hover:text-teal-200 bg-teal-500/10 px-3 py-1.5 rounded-md"><ExternalLink size={15} />Open Original Job</a> : null}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-4">
              <h3 className="mb-2 flex items-center gap-2 font-medium"><Gauge size={16} />Fit Analysis</h3>
              <div className="space-y-1">
                <p className="text-sm text-zinc-400"><span className="text-zinc-500">Career upside:</span> {parsed.careerUpside}</p>
                <p className="text-sm text-zinc-400"><span className="text-zinc-500">Interview prob:</span> {parsed.interviewProbability}</p>
                <p className="text-sm text-zinc-400"><span className="text-zinc-500">Priority:</span> {parsed.priority}</p>
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="mb-2 flex items-center gap-2 font-medium"><Sparkles size={16} />Compensation</h3>
              <p className="text-sm text-zinc-300">{job.compensation_estimate || "No estimate available."}</p>
            </Card>
            <Card className="p-4 border-amber-900/50">
              <h3 className="mb-2 flex items-center gap-2 font-medium text-amber-500"><AlertTriangle size={16} />Risks</h3>
              <p className="text-sm text-zinc-300">{parsed.risks || "No major risk flagged."}</p>
            </Card>
          </div>

          <ResumeViewer job={job} onCompiled={(pdfPath) => setJob((current) => ({ ...current, resume_used: pdfPath, resume_version: new Date().toISOString() }))} />

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
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => savePatch({ status: "shortlisted", review_decision: "approved", recruiter_message: message, resume_summary: summary })}><CheckCircle2 size={16} />Approve for Application</Button>
              <Button variant="danger" onClick={() => savePatch({ status: "rejected", review_decision: "rejected", recruiter_message: message, resume_summary: summary })}><XCircle size={16} />Reject Role</Button>
              <Button variant="secondary" onClick={() => savePatch({ recruiter_message: message, resume_summary: summary })}>Save Edits</Button>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="mb-3 font-medium">Extracted Keywords</h3>
            <div className="flex flex-wrap gap-2">
              {keywords.length ? keywords.map((keyword) => <span key={keyword} className="rounded-full bg-teal-500/15 px-2 py-1 text-xs text-teal-200">{keyword}</span>) : <span className="text-sm text-zinc-500">No tracked keywords matched.</span>}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 font-medium text-lg border-b border-zinc-800 pb-2">Original Job Description</h3>
            <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-300 leading-relaxed">{jd.replace(/&lt;[^&]*&gt;/g, " ")}</pre>
          </Card>
        </div>
      </div>
    </main>
  );
}
