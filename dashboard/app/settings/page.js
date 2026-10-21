"use client";

import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const money = (value, currency) => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value || 0));

export default function ApplicationSettingsPage() {
  const [currency, setCurrency] = useState("INR");
  const [currentAnnual, setCurrentAnnual] = useState("1800000");
  const [hikePercent, setHikePercent] = useState("40");
  const [fitThreshold, setFitThreshold] = useState("7");
  const [scheduledAutoApply, setScheduledAutoApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const expectedAnnual = useMemo(() => Math.round(Number(currentAnnual || 0) * (1 + Number(hikePercent || 0) / 100)), [currentAnnual, hikePercent]);

  useEffect(() => {
    fetch(`${API}/api/settings/application`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Could not load application preferences."); return response.json(); })
      .then((settings) => {
        setCurrency(settings.currency || "INR");
        setCurrentAnnual(String(settings.currentAnnual || 0));
        setHikePercent(String(settings.hikePercent || 0));
        setFitThreshold(String(settings.fitThreshold ?? 7));
        setScheduledAutoApply(Boolean(settings.scheduledAutoApply));
      })
      .catch((error) => setMessage(error.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${API}/api/settings/application`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, currentAnnual: Number(currentAnnual), hikePercent: Number(hikePercent), fitThreshold: Number(fitThreshold), scheduledAutoApply })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save application preferences.");
      setMessage(scheduledAutoApply ? "Saved. The scheduler will auto-apply to eligible jobs every 15 minutes while it is running." : "Saved. Scheduled auto-apply is off; the scheduler will only discover jobs.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <a href="/" className="text-sm text-teal-300 hover:text-teal-200">← Back to applications</a>
        <header>
          <h1 className="text-3xl font-semibold">Application preferences</h1>
          <p className="mt-2 text-sm text-zinc-400">Set your current annual salary once. The expected salary is calculated from your target hike for each application.</p>
        </header>
        <form onSubmit={save} className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
          <label className="block text-sm text-zinc-300">
            Currency
            <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-zinc-100">
              <option value="INR">INR — Indian rupee</option>
              <option value="USD">USD — US dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British pound</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-700 bg-zinc-950 p-4 text-sm text-zinc-200">
            <input type="checkbox" checked={scheduledAutoApply} onChange={(event) => setScheduledAutoApply(event.target.checked)} className="mt-1 accent-teal-500" />
            <span>
              <span className="block font-medium">Enable scheduled auto-apply</span>
              <span className="mt-1 block text-xs text-zinc-400">When the scheduler is running, it will apply every 15 minutes to roles that pass your score, compensation, role-fit, and supported-site checks. CAPTCHA and unanswered required questions stop for review.</span>
            </span>
          </label>
          <label className="block text-sm text-zinc-300">
            Current annual salary
            <input required min="1" type="number" step="1" value={currentAnnual} onChange={(event) => setCurrentAnnual(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-zinc-100" />
          </label>
          <label className="block text-sm text-zinc-300">
            Expected hike
            <div className="mt-2 flex h-11 items-center rounded-md border border-zinc-700 bg-zinc-950 pr-3 focus-within:border-teal-600">
              <input required min="0" max="300" type="number" step="0.1" value={hikePercent} onChange={(event) => setHikePercent(event.target.value)} className="h-full w-full bg-transparent px-3 text-zinc-100 outline-none" />
              <span className="text-zinc-500">%</span>
            </div>
          </label>
          <label className="block text-sm text-zinc-300">
            Minimum fit score for auto-apply
            <div className="mt-2 flex h-11 items-center rounded-md border border-zinc-700 bg-zinc-950 pr-3 focus-within:border-teal-600">
              <input required min="0" max="10" type="number" step="0.1" value={fitThreshold} onChange={(event) => setFitThreshold(event.target.value)} className="h-full w-full bg-transparent px-3 text-zinc-100 outline-none" />
              <span className="text-zinc-500">/ 10</span>
            </div>
            <span className="mt-1 block text-xs text-zinc-500">Set by a person. Lower scores make more roles eligible; other checks still apply.</span>
          </label>
          <div className="rounded-lg border border-teal-900 bg-teal-500/10 p-4">
            <p className="text-xs uppercase tracking-wide text-teal-200">Expected annual salary</p>
            <p className="mt-1 text-2xl font-semibold text-white">{money(expectedAnnual, currency)}</p>
            <p className="mt-1 text-xs text-zinc-400">Calculated as current salary × (1 + hike ÷ 100)</p>
          </div>
          <button disabled={busy} className="h-10 rounded-md bg-teal-500 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-60">{busy ? "Saving…" : "Save preferences"}</button>
          {message ? <p role="status" className="text-sm text-zinc-300">{message}</p> : null}
        </form>
        <p className="text-xs text-zinc-500">The CAPTCHA step is handled as a human checkpoint. The browser will pause for you when a site requires it.</p>
      </div>
    </main>
  );
}
