import { api } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Attempt={id:string;productType:string;amountMinor:number;status:string;qrPayload?:string;createdAt:string};
type Billing={plan:'free'|'premium';premium:boolean;expiresAt?:string;attempts:Attempt[]};
const money=(amount:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(amount/100);

export default function PlanBillingCard(){
  const {t}=useTranslation();
  const [billing,setBilling]=useState<Billing>();const [active,setActive]=useState<Attempt>();const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{const value=await api<Billing>('/monetization/me');setBilling(value);const pending=value.attempts.find(item=>item.productType==='premium_subscription'&&item.status==='pending');setActive(previous=>pending??(previous?value.attempts.find(item=>item.id===previous.id)??previous:undefined));},[]);
  useEffect(()=>{let alive=true;const refresh=()=>{void load().catch(cause=>{if(alive)setError(cause instanceof Error?cause.message:t('backend.serverUnavailable'));});};refresh();const timer=window.setInterval(refresh,3000);return()=>{alive=false;window.clearInterval(timer);};},[load,t]);
  const purchase=async()=>{setBusy(true);setError('');try{const result=await api<{attempt:Attempt}>('/monetization/premium','POST',{});setActive(result.attempt);await load();}catch(cause){setError(cause instanceof Error?cause.message:t('monetization.startError'));}finally{setBusy(false);}};
  const status=active?.status??billing?.attempts.find(item=>item.productType==='premium_subscription')?.status;
  return <section className="rounded-xl border border-loop-200 bg-white p-5 shadow-sm dark:border-loop-900 dark:bg-steel-900">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-loop-700 dark:text-loop-300">{t('monetization.planBilling')}</p><h2 className="mt-1 font-archivo text-xl font-bold">{billing?.premium?t('monetization.premiumPlan'):t('monetization.freePlan')}</h2><p className="mt-1 text-sm text-steel-600 dark:text-steel-300">{billing?.premium&&billing.expiresAt?t('monetization.activeThrough',{date:new Date(billing.expiresAt).toLocaleDateString()}):t('monetization.freeAvailable')}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${billing?.premium?'bg-loop-100 text-loop-900 dark:bg-loop-900 dark:text-loop-100':'bg-steel-100 text-steel-700 dark:bg-steel-800 dark:text-steel-200'}`}>{billing?.plan??t('monetization.loading')}</span></div>
    <ul className="mt-4 grid gap-2 text-sm text-steel-700 dark:text-steel-200 sm:grid-cols-2"><li>★ {t('monetization.premiumBadge')}</li><li>{t('monetization.advancedAnalytics')}</li><li>{t('monetization.impactReports')}</li><li>{t('monetization.monthlyPlan')}</li></ul>
    {status&&<p className="mt-4 text-sm">{t('monetization.latestPayment')}: <strong className="capitalize">{t("monetization.paymentStatus."+status,{defaultValue:status.replace("_"," ")})}</strong></p>}
    {active?.status==='pending'&&active.qrPayload&&<div className="mt-3 rounded-lg border border-steel-200 bg-steel-50 p-3 dark:border-steel-700 dark:bg-steel-950"><p className="text-sm font-semibold">{t('monetization.sandboxPending',{amount:money(active.amountMinor)})}</p><code className="mt-2 block break-all text-xs text-steel-600 dark:text-steel-300">{active.qrPayload}</code><p className="mt-2 text-xs text-steel-500">{t('monetization.verifiedServer')}</p></div>}
    {error&&<p role="alert" className="mt-3 text-sm text-error-700">{error}</p>}
    {!billing?.premium&&<button type="button" disabled={busy||active?.status==='pending'} onClick={()=>void purchase()} className="mt-4 min-h-10 rounded-lg bg-loop-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?t('monetization.startingPayment'):billing?.attempts.some(item=>item.productType==='premium_subscription'&&item.status==='paid')?t('monetization.renew'):t('monetization.upgrade')}</button>}
  </section>;
}
