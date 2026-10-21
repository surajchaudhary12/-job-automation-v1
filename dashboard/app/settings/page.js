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
    <main className="min-h-screen bg-[#f7f8f5] p-4 text-stone-900 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-7">
        <a href="/" className="text-sm font-medium text-emerald-700 hover:text-emerald-900">← Back to jobs</a>
        <header>
          <p className="mb-2 text-sm font-medium text-emerald-700">Preferences</p>
          <h1 className="text-3xl font-semibold tracking-tight">Set your application defaults.</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">Your salary target is calculated automatically and reused for each application.</p>
        </header>
        <form onSubmit={save} className="space-y-6 rounded-xl border border-stone-200 bg-white p-5 sm:p-7">
          <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-stone-700">
            Current annual salary
            <input required min="1" type="number" step="1" value={currentAnnual} onChange={(event) => setCurrentAnnual(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-stone-900 outline-none focus:border-emerald-700" />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Expected hike
            <div className="mt-2 flex h-11 items-center rounded-lg border border-stone-200 bg-white pr-3 focus-within:border-emerald-700">
              <input required min="0" max="300" type="number" step="0.1" value={hikePercent} onChange={(event) => setHikePercent(event.target.value)} className="h-full w-full bg-transparent px-3 text-stone-900 outline-none" />
              <span className="text-stone-400">%</span>
            </div>
          </label>
          </div>
          <div className="rounded-lg bg-emerald-50 px-4 py-3.5">
            <p className="text-xs font-medium text-emerald-800">Expected annual salary</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">{money(expectedAnnual, currency)}</p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 p-4 text-sm text-stone-800 transition hover:border-stone-300">
            <input type="checkbox" checked={scheduledAutoApply} onChange={(event) => setScheduledAutoApply(event.target.checked)} className="mt-1 accent-emerald-700" />
            <span>
              <span className="block font-medium">Apply to matching jobs automatically</span>
              <span className="mt-1 block text-xs leading-5 text-stone-500">Runs every 15 minutes while the scheduler is on. CAPTCHA and unanswered questions pause for your review.</span>
            </span>
          </label>
          <details className="group border-t border-stone-100 pt-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-stone-600 marker:hidden">Advanced matching <span className="ml-1 text-stone-400 group-open:hidden">+</span><span className="ml-1 hidden text-stone-400 group-open:inline">−</span></summary>
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-stone-700">
                Minimum fit score for auto-apply
                <div className="mt-2 flex h-11 items-center rounded-lg border border-stone-200 bg-white pr-3 focus-within:border-emerald-700">
                  <input required min="0" max="10" type="number" step="0.1" value={fitThreshold} onChange={(event) => setFitThreshold(event.target.value)} className="h-full w-full bg-transparent px-3 text-stone-900 outline-none" />
                  <span className="text-stone-400">/ 10</span>
                </div>
                <span className="mt-1 block text-xs font-normal text-stone-500">Lower scores include more roles. Other eligibility checks still apply.</span>
              </label>
              <label className="block text-sm font-medium text-stone-700">
                Currency
                <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-stone-900 outline-none focus:border-emerald-700">
                  <option value="INR">INR — Indian rupee</option><option value="USD">USD — US dollar</option><option value="EUR">EUR — Euro</option><option value="GBP">GBP — British pound</option>
                </select>
              </label>
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-4 border-t border-stone-100 pt-5">
            <button disabled={busy} className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy ? "Saving…" : "Save preferences"}</button>
            {message ? <p role="status" className="text-sm text-stone-600">{message}</p> : null}
          </div>
        </form>
        <p className="text-xs text-stone-500">Applications pause when a CAPTCHA or a required question needs your input.</p>
      </div>
    </main>
  );
}
