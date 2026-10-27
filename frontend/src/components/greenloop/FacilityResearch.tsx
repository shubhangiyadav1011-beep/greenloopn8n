import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext.helpers";
import { api } from "@/lib/api";
import type { ManualFacilityDetails, ReceiverFacility } from "@shared/domain/types";
import { useEffect, useState } from "react";

type Finding = { status: "confirmed" | "listed" | "unclear" | "not_found"; evidence: string[]; evidenceExcerpt?: string; support?: "explicit" | "category" | "unclear"; material?: string; value?: string; type?: string; name?: string; description?: string };
type Report = { id?: string; kind?: "website" | "public_listings"; facilityName: string; websiteUrl?: string; researchedAt: string; listings?: { title: string; sourceUrl: string; providerName: string; excerpt: string }[]; acceptedMaterials: Finding[]; publicContacts: Finding[]; locations?: Finding[]; services: Finding[]; citations?: string[]; missingInformation: string[]; warning?: string };
type ContactDraft = { id: string; type: string; value: string };
const categoryLabels: Record<string, string> = { acceptedMaterials: "Accepted materials", publicContacts: "Public contact information", location: "Location", services: "Relevant services", listings: "Public listings" };
const inputClass = "min-h-10 w-full rounded-md border border-steel-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-loop-600 focus:ring-2 focus:ring-loop-600/15 dark:border-steel-700 dark:bg-[#101a14] dark:text-white";
const emptyManual = (): Omit<ManualFacilityDetails, "id" | "updatedAt"> => ({ acceptedMaterials: [], contacts: [], location: "", services: [] });

export default function FacilityResearch({ facility }: { facility: ReceiverFacility }) {
  const { user } = useAuth();
  const isOwner = user?.receiverId === facility.id;
  const [websiteUrl, setWebsiteUrl] = useState(facility.websiteUrl ?? "");
  const [editingWebsite, setEditingWebsite] = useState(!facility.websiteUrl && isOwner);
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [researching, setResearching] = useState(false);
  const [publicListingsAvailable, setPublicListingsAvailable] = useState<boolean | null>(null);
  const [savingManual, setSavingManual] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Report | null>(null);
  const [manual, setManual] = useState<Omit<ManualFacilityDetails, "id" | "updatedAt">>(() => facility.manualDetails ?? emptyManual());
  const [manualVersion, setManualVersion] = useState<ManualFacilityDetails | undefined>(facility.manualDetails);
  const [manualHistory, setManualHistory] = useState(facility.manualDetailsHistory ?? []);
  const [researchHistory, setResearchHistory] = useState(facility.researchHistory ?? []);
  const [acceptedText, setAcceptedText] = useState(manual.acceptedMaterials.join("\n"));
  const [serviceText, setServiceText] = useState(manual.services.join("\n"));
  const [contactDrafts, setContactDrafts] = useState<ContactDraft[]>(manual.contacts);
  const [manualLocation, setManualLocation] = useState(manual.location);
  const [editingManual, setEditingManual] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ available: boolean }>("/facility-research/public-listings-status")
      .then(({ available }) => { if (active) setPublicListingsAvailable(available); })
      .catch(() => { if (active) setPublicListingsAvailable(false); });
    return () => { active = false; };
  }, []);

  const saveWebsite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSavingWebsite(true); setError(""); setMessage("");
    try { const saved = websiteUrl.trim(); await api<{ user: unknown }>("/profile", "PATCH", { websiteUrl: saved }); setWebsiteUrl(saved); setEditingWebsite(false); setMessage("Facility website saved. Website research is ready."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the facility website."); }
    finally { setSavingWebsite(false); }
  };

  const runResearch = async (publicListings: boolean) => {
    setResearching(true); setError(""); setMessage("");
    try {
      const path = `/facilities/${encodeURIComponent(facility.id)}/${publicListings ? "public-research" : "research"}`;
      const response = await api<{ research: Report }>(path, "POST", {});
      setResult(response.research);
      setResearchHistory(rows => [...rows, response.research]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Facility research could not be completed."); }
    finally { setResearching(false); }
  };

  const saveManual = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSavingManual(true); setError(""); setMessage("");
    const current = manualVersion;
    const payload = { acceptedMaterials: acceptedText.split("\n").map(value => value.trim()).filter(Boolean), services: serviceText.split("\n").map(value => value.trim()).filter(Boolean), contacts: contactDrafts.filter(contact => contact.value.trim()).map(contact => ({ ...contact, value: contact.value.trim() })), location: manualLocation.trim(), expectedUpdatedAt: current?.updatedAt ?? null };
    try {
      const response = await api<{ manualDetails: ManualFacilityDetails; manualDetailsHistory: ManualFacilityDetails[] }>(`/facilities/${encodeURIComponent(facility.id)}/manual-details`, "PUT", payload);
      const saved = response.manualDetails; setManual(saved); setManualVersion(saved); setManualHistory(response.manualDetailsHistory); setAcceptedText(saved.acceptedMaterials.join("\n")); setServiceText(saved.services.join("\n")); setContactDrafts(saved.contacts); setManualLocation(saved.location); setEditingManual(false); setMessage("Manual details saved and labeled unverified.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save manual details."); }
    finally { setSavingManual(false); }
  };

  const isPartial = Boolean(result && (result.missingInformation.length > 0 || [...result.acceptedMaterials, ...result.publicContacts, ...(result.locations ?? []), ...result.services].some(item => item.status !== "confirmed")));
  const existingReports = researchHistory;
  const hasCurrentManual = Boolean(manual.acceptedMaterials.length || manual.contacts.length || manual.location || manual.services.length);

  return <section className="mt-4 border-t border-steel-100 pt-3 dark:border-steel-800" aria-labelledby={`facility-research-${facility.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h4 id={`facility-research-${facility.id}`} className="text-sm font-semibold text-ink-900 dark:text-white">Facility research</h4><p className="mt-0.5 text-xs text-steel-600 dark:text-gray-400">Source-backed findings stay separate from user-provided details.</p></div>
      {websiteUrl.trim() ? <Button size="sm" disabled={researching || savingWebsite} onClick={() => runResearch(false)}>{researching ? "Researching…" : "Research website"}</Button> : publicListingsAvailable ? <Button size="sm" disabled={researching || savingWebsite} onClick={() => runResearch(true)}>{researching ? "Researching…" : "Research Public Listings"}</Button> : <Button size="sm" disabled>{publicListingsAvailable === null ? "Checking availability…" : "Public listings unavailable"}</Button>}
    </div>

    {isOwner ? <details className="mt-3" open={editingWebsite}><summary className="cursor-pointer text-xs font-semibold text-loop-700 dark:text-loop-300">{websiteUrl ? "Manage facility website" : "Add facility website"}</summary><form onSubmit={saveWebsite} className="mt-2 space-y-2"><label htmlFor={`facility-website-${facility.id}`} className="block text-xs font-medium text-steel-700 dark:text-gray-300">Official public website URL</label><div className="flex flex-col gap-2 sm:flex-row"><input id={`facility-website-${facility.id}`} type="url" inputMode="url" required maxLength={2048} placeholder="https://example.org" value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} className={inputClass} /><Button size="sm" type="submit" disabled={savingWebsite || !websiteUrl.trim()}>{savingWebsite ? "Saving…" : "Save website"}</Button></div><p className="text-xs leading-5 text-steel-500 dark:text-gray-400">Enter the facility’s actual HTTPS website. Website research runs only after it is saved.</p></form></details> : !websiteUrl.trim() ? <p className="mt-2 text-xs leading-5 text-steel-600 dark:text-gray-400">No website URL is available.</p> : <p className="mt-2 break-all text-xs text-steel-500 dark:text-gray-400">Website: {websiteUrl}</p>}
    {!websiteUrl.trim() && publicListingsAvailable === false && <p className="mt-2 text-xs leading-5 text-steel-600 dark:text-gray-400">Public listing research is currently unavailable. Facility owners can still add details manually, or add a website to use website research.</p>}

    {isOwner && <details className="mt-3" open={editingManual}><summary className="cursor-pointer text-xs font-semibold text-loop-700 dark:text-loop-300">{hasCurrentManual ? "Edit manual facility details" : "Add Details Manually"}</summary><p className="mt-1 text-xs leading-5 text-steel-500 dark:text-gray-400">These details are labeled “User-provided — Unverified” and stored separately from facility data and research history.</p><form onSubmit={saveManual} className="mt-2 space-y-3"><label className="block text-xs font-medium text-steel-700 dark:text-gray-300">Accepted construction materials<textarea rows={3} value={acceptedText} onChange={event => setAcceptedText(event.target.value)} placeholder="One material per line" className={`${inputClass} mt-1`} /></label><label className="block text-xs font-medium text-steel-700 dark:text-gray-300">Location<input value={manualLocation} onChange={event => setManualLocation(event.target.value)} maxLength={250} className={`${inputClass} mt-1`} /></label><div className="space-y-2"><p className="text-xs font-medium text-steel-700 dark:text-gray-300">Contact information</p>{contactDrafts.map((contact, index) => <div key={contact.id} className="flex gap-2"><select aria-label="Contact type" value={contact.type} onChange={event => setContactDrafts(rows => rows.map((row, i) => i === index ? { ...row, type: event.target.value } : row))} className={inputClass}><option value="email">Email</option><option value="phone">Phone</option><option value="address">Address</option><option value="other">Other</option></select><input aria-label="Contact value" value={contact.value} onChange={event => setContactDrafts(rows => rows.map((row, i) => i === index ? { ...row, value: event.target.value } : row))} maxLength={250} className={inputClass} /><button type="button" onClick={() => setContactDrafts(rows => rows.filter((_, i) => i !== index))} className="text-xs text-error-700">Remove</button></div>)}<Button size="sm" type="button" onClick={() => setContactDrafts(rows => [...rows, { id: crypto.randomUUID(), type: "email", value: "" }])}>Add contact</Button></div><label className="block text-xs font-medium text-steel-700 dark:text-gray-300">Relevant services<textarea rows={3} value={serviceText} onChange={event => setServiceText(event.target.value)} placeholder="One service per line" className={`${inputClass} mt-1`} /></label><div className="flex gap-2"><Button size="sm" type="submit" disabled={savingManual}>{savingManual ? "Saving…" : "Save manual details"}</Button><Button size="sm" type="button" onClick={() => setEditingManual(false)}>Cancel</Button></div></form></details>}

    {message && <p role="status" className="mt-2 text-xs font-medium text-loop-700 dark:text-loop-300">{message}</p>}{error && <p role="alert" className="mt-2 border border-error-200 bg-error-25 p-3 text-sm text-error-700 dark:border-error-900 dark:bg-error-950/40 dark:text-error-200">{error}</p>}{researching && <p className="mt-3 rounded-md bg-steel-50 p-3 text-sm text-steel-700 dark:bg-white/5 dark:text-gray-300" role="status">Searching public sources associated with this facility. Listings have not been verified by the facility.</p>}

    {result && <ReportPanel result={result} partial={isPartial} />}
    {hasCurrentManual && <section className="mt-4 rounded-md border border-signal-200 p-3 dark:border-signal-800"><div className="flex flex-wrap justify-between gap-2"><h5 className="text-xs font-bold uppercase tracking-wide text-steel-700 dark:text-gray-300">User-provided — Unverified</h5><span className="text-[11px] text-steel-500">Updated {manualVersion?.updatedAt ? new Date(manualVersion.updatedAt).toLocaleString() : ""}</span></div><FindingGroup title="Accepted materials" findings={manual.acceptedMaterials.map(value => ({ material: value, status: "unclear", evidence: [], description: "User-provided — Unverified" }))} label={item => item.material ?? "Material"} /><FindingGroup title="Contact information" findings={manual.contacts.map(contact => ({ type: contact.type, value: contact.value, status: "unclear", evidence: [], description: "User-provided — Unverified" }))} label={item => `${item.type}: ${item.value}`} /><FindingGroup title="Location" findings={manual.location ? [{ value: manual.location, status: "unclear", evidence: [], description: "User-provided — Unverified" }] : []} label={item => item.value ?? "Location"} /><FindingGroup title="Services" findings={manual.services.map(name => ({ name, status: "unclear", evidence: [], description: "User-provided — Unverified" }))} label={item => item.name ?? "Service"} /></section>}
    {existingReports.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-loop-700 dark:text-loop-300">Research history ({existingReports.length})</summary><ul className="mt-2 space-y-2">{existingReports.slice(-5).reverse().map((item, index) => { const report = item as Report; return <li key={String(item.id ?? index)} className="rounded border border-steel-200 p-2 dark:border-steel-700"><details><summary className="cursor-pointer text-xs"><strong>{item.kind === "public_listings" ? "Public listing search" : "Website research"}</strong><span className="ms-2 text-steel-500">{typeof item.researchedAt === "string" ? new Date(item.researchedAt).toLocaleString() : ""}</span></summary><ReportPanel result={report} partial={report.missingInformation?.length > 0} /></details></li>; })}</ul></details>}
    {manualHistory.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-xs text-steel-600 dark:text-gray-400">Previous manual versions ({manualHistory.length})</summary><ul className="mt-2 space-y-1 text-xs text-steel-600 dark:text-gray-400">{manualHistory.slice(-5).reverse().map(item => <li key={item.id + item.updatedAt}>{new Date(item.updatedAt).toLocaleString()} — User-provided — Unverified</li>)}</ul></details>}
  </section>;
}

function ReportPanel({ result, partial }: { result: Report; partial: boolean }) {
  const listed = result.kind === "public_listings";
  return <div className="mt-3 space-y-4" aria-live="polite"><div className={`rounded-md border p-3 text-sm ${partial ? "border-signal-200 bg-signal-25 text-ink-800 dark:border-signal-800 dark:bg-signal-950/30 dark:text-gray-200" : "border-loop-200 bg-loop-25 text-loop-800 dark:border-loop-800 dark:bg-loop-950/30 dark:text-loop-200"}`}><p className="font-semibold">{listed ? "Public listing search completed" : partial ? "Website research completed with unclear or missing information" : "Website research completed"}</p>{result.websiteUrl && <p className="mt-1 text-xs">Source website: <SourceLink source={result.websiteUrl} /></p>}{listed && <p className="mt-1 text-xs">Public listing information is unverified and attributed to each cited listing.</p>}</div>
    {listed && result.listings?.length ? <section><h5 className="text-xs font-bold uppercase tracking-wide text-steel-700 dark:text-gray-300">Matching public listings</h5><ul className="mt-2 space-y-2">{result.listings.map((listing, i) => <li key={`${listing.sourceUrl}-${i}`} className="rounded-md border border-steel-200 p-3 dark:border-steel-700"><p className="text-sm font-semibold">{listing.title}</p><p className="text-xs text-steel-500">{listing.providerName} — Public listing, unverified</p>{listing.excerpt && <blockquote className="mt-2 border-s-2 border-loop-500 ps-3 text-sm italic">“{listing.excerpt}”</blockquote>}<SourceLink source={listing.sourceUrl} /></li>)}</ul></section> : null}
    {result.missingInformation.length > 0 && <p className="text-xs leading-5 text-steel-600 dark:text-gray-400">No source-backed information found for: {result.missingInformation.map(item => categoryLabels[item] ?? item).join(", ")}.</p>}
    <FindingGroup title="Accepted materials" findings={result.acceptedMaterials} label={item => item.material ?? "Material"} /><FindingGroup title="Public contact information" findings={result.publicContacts} label={item => `${item.type ? `${item.type}: ` : ""}${item.value ?? "Contact"}`} /><FindingGroup title="Location" findings={result.locations ?? []} label={item => `${item.type ? `${item.type}: ` : ""}${item.value ?? "Location"}`} /><FindingGroup title="Relevant services" findings={result.services} label={item => item.name ?? "Service"} />{result.warning && <p className="text-xs text-steel-600 dark:text-gray-400">{result.warning}</p>}<p className="text-[11px] text-steel-500 dark:text-gray-400">Researched {new Date(result.researchedAt).toLocaleString()}</p>
  </div>;
}

function FindingGroup({ title, findings, label }: { title: string; findings: Finding[]; label: (finding: Finding) => string }) {
  return <section aria-label={title}><h5 className="text-xs font-bold uppercase tracking-wide text-steel-700 dark:text-gray-300">{title}</h5>{findings.length ? <ul className="mt-2 space-y-2">{findings.map((finding, index) => { const state = finding.status === "confirmed" ? "Explicitly stated on website" : finding.status === "listed" ? `Public listing — ${finding.support === "explicit" ? "explicitly states" : "listing category"}, unverified` : finding.status === "not_found" ? "Not found" : "Unclear"; return <li key={`${label(finding)}-${index}`} className="rounded-md border border-steel-200 p-3 dark:border-steel-700"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-semibold text-ink-900 dark:text-white">{label(finding)}</p><span className="text-[11px] font-semibold uppercase tracking-wide text-steel-600 dark:text-gray-300">{state}</span></div>{finding.description && <p className="mt-1 text-sm leading-5 text-steel-600 dark:text-gray-400">{finding.description}</p>}{finding.evidenceExcerpt && <blockquote className="mt-2 border-s-2 border-loop-500 ps-3 text-sm italic leading-5 text-steel-700 dark:text-gray-300">“{finding.evidenceExcerpt}”</blockquote>}{finding.evidence.length > 0 && <ul className="mt-2 space-y-1">{finding.evidence.map(source => <li key={source}><SourceLink source={source} /></li>)}</ul>}{finding.status !== "confirmed" && finding.status !== "listed" && !finding.evidenceExcerpt && <p className="mt-2 text-xs text-steel-500 dark:text-gray-400">Sources did not provide enough evidence to confirm this finding.</p>}</li>; })}</ul> : <p className="mt-1 text-xs text-steel-500 dark:text-gray-400">No findings returned for this category.</p>}</section>;
}

function SourceLink({ source }: { source: string }) { let url: URL; try { url = new URL(source); } catch { return null; } if (url.protocol !== "https:") return null; return <a href={url.href} target="_blank" rel="noopener noreferrer" className="break-all text-xs font-medium text-loop-700 underline underline-offset-2 hover:text-loop-900 dark:text-loop-300 dark:hover:text-loop-200">Source: {url.hostname}{url.pathname !== "/" ? url.pathname : ""}</a>; }
