import PageMeta from "@/components/common/PageMeta";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import type { Role, User } from "@/context/AuthContext.helpers";
import { useAuth } from "@/context/AuthContext.helpers";
import { ArrowRightIcon, BoxCubeIcon, CheckLineIcon, ChevronLeftIcon, TruckDelivery } from "@/icons";
import { cn } from "@/utils";
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router";
import AuthLayout from "./AuthPageLayout";

const ROLE_OPTIONS: { key: string; roles: Role[] }[] = [
  { key: "provider", roles: ["provider"] },
  { key: "receiver", roles: ["receiver"] },
  { key: "both", roles: ["provider", "receiver"] },
];

function OnboardingForm({ user }: { user: User }) {
  const { t } = useTranslation();
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState(user.organization || "");
  const [location, setLocation] = useState(user.location || "");
  const [vat, setVat] = useState(user.vat || "");
  const [roles, setRoles] = useState<Role[]>(user.workspaces);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);

  const finishOnboarding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (roles.length === 0 || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    try {
      const homeRole = user.activeWorkspace && roles.includes(user.activeWorkspace) ? user.activeWorkspace : roles[0];
      if (!await updateUser({ organization: orgName.trim() || user.organization, location: location.trim(), vat: vat.trim(), workspaces: roles, activeWorkspace: homeRole })) return;
      navigate("/app");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <AuthLayout>
      <div className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-lg px-6 pt-8 sm:px-8">
          <Link to="/" className="inline-flex items-center text-sm text-steel-600 transition-colors hover:text-ink-900 dark:text-steel-400 dark:hover:text-white">
            <ChevronLeftIcon className="size-5 rtl:rotate-180" />{t("onboarding.backToSite")}
          </Link>
        </div>
        <form onSubmit={finishOnboarding} className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-8 sm:px-8" aria-busy={saving}>
          <fieldset disabled={saving}>
            <legend className="eyebrow-label mb-4 text-steel-500 dark:text-steel-400">{t("onboarding.setup")}</legend>
            <h1 id="role-heading" className="font-archivo text-3xl font-bold tracking-tight text-ink-900 dark:text-white">{t("onboarding.roleTitle")}</h1>
            <p className="mt-1 text-sm text-steel-600 dark:text-steel-400">{t("onboarding.roleDescription")}</p>
            <div role="group" aria-labelledby="role-heading" className="mt-5 grid grid-cols-1 gap-3 xsm:grid-cols-3">
              {ROLE_OPTIONS.map(option => {
                const active = option.roles.length === roles.length && option.roles.every(role => roles.includes(role));
                return (
                  <button key={option.key} type="button" aria-pressed={active} onClick={() => setRoles(option.roles)} className={cn(
                    "relative flex h-full flex-col items-center rounded-sm border px-3 py-4 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop-600 dark:focus-visible:outline-loop-400",
                    active ? "border-loop-500 bg-loop-25 text-loop-800 ring-1 ring-loop-500/20 dark:border-loop-400 dark:bg-loop-500/10 dark:text-loop-200" : "border-steel-200 bg-white text-ink-900 hover:border-loop-500 dark:border-steel-700 dark:bg-black dark:text-white dark:hover:border-loop-400",
                  )}>
                    <span aria-hidden="true" className={cn("absolute start-3 top-3 flex size-4 items-center justify-center rounded-xs border", active ? "border-loop-700 bg-loop-700 text-white dark:border-loop-400 dark:bg-loop-400 dark:text-loop-950" : "border-steel-300 dark:border-steel-600")}>
                      {active && <CheckLineIcon className="size-3" />}
                    </span>
                    <span aria-hidden="true" className="mb-3 mt-3 flex h-8 items-center justify-center">
                      {option.key === "provider" ? <TruckDelivery className="size-8" /> : option.key === "receiver" ? <BoxCubeIcon className="size-8" /> : <span className="flex flex-col"><ArrowRightIcon className="h-4 w-8" /><ArrowRightIcon className="h-4 w-8 rotate-180" /></span>}
                    </span>
                    <span className="font-archivo text-theme-xs font-bold uppercase tracking-wide">{t(`onboarding.roles.${option.key}.title`)}</span>
                    <span className="mt-2 text-theme-xs leading-5 text-steel-600 dark:text-steel-400">{t(`onboarding.roles.${option.key}.description`)}</span>
                  </button>
                );
              })}
            </div>
            <section aria-labelledby="organization-heading" className="mt-6 border-t border-steel-200 pt-5 dark:border-steel-800">
              <h2 id="organization-heading" className="font-archivo text-2xl font-bold tracking-tight text-ink-900 dark:text-white">{t("onboarding.organizationTitle")}</h2>
              <p className="mt-1 text-sm text-steel-600 dark:text-steel-400">{t("onboarding.organizationDescription")}</p>
              <div className="mt-5 space-y-4">
                <div><Label htmlFor="onboarding-organization">{t("onboarding.organizationName")}</Label><Input id="onboarding-organization" autoComplete="organization" value={orgName} onChange={event => setOrgName(event.target.value)} placeholder={t("onboarding.organizationPlaceholder")} maxLength={250} /></div>
                <div><Label htmlFor="onboarding-location">{t("onboarding.location")}</Label><Input id="onboarding-location" value={location} onChange={event => setLocation(event.target.value)} placeholder={t("onboarding.locationPlaceholder")} maxLength={250} /></div>
                <div><Label htmlFor="onboarding-vat">{t("onboarding.vat")}</Label><Input id="onboarding-vat" value={vat} onChange={event => setVat(event.target.value)} placeholder={t("onboarding.optional")} maxLength={250} /></div>
              </div>
            </section>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => navigate("/sign-up")} className="flex flex-1 items-center justify-center rounded-sm border border-steel-300 bg-white px-4 py-3 text-theme-xs font-bold uppercase tracking-wide text-ink-900 transition-colors hover:border-ink-900 dark:border-steel-700 dark:bg-black dark:text-white dark:hover:border-white">{t("onboarding.back")}</button>
              <button type="submit" disabled={roles.length === 0 || saving} className="flex flex-2 items-center justify-center rounded-sm border border-loop-800 bg-loop-800 px-4 py-3 text-theme-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-loop-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-loop-500 dark:bg-loop-600 dark:text-white dark:hover:bg-loop-500">{t(saving ? "onboarding.saving" : "onboarding.finish")}</button>
            </div>
          </fieldset>
        </form>
      </div>
    </AuthLayout>
  );
}

export default function Onboarding() {
  const { t } = useTranslation();
  const { user, ready } = useAuth();
  if (!ready) return <div role="status" className="flex min-h-screen items-center justify-center bg-white text-sm text-steel-500 dark:bg-gray-900 dark:text-steel-400">{t("onboarding.restoring")}</div>;
  if (!user) return <Navigate to="/sign-in" replace />;
  return <><PageMeta title={t("onboarding.metaTitle")} description={t("onboarding.metaDescription")} /><OnboardingForm key={user.id} user={user} /></>;
}
