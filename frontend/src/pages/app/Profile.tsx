import PageMeta from "@/components/common/PageMeta";
import { PageMotion, RevealItem } from "@/components/greenloop/kit";
import Button from "@/components/ui/button/Button";
import { ambientMedia } from "@/config/appMedia";
import PlanBillingCard from "@/components/monetization/PlanBillingCard";
import { useAuth } from "@/context/AuthContext.helpers";
import { useState } from "react";
import { Link } from "react-router";

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState(() => ({
    fullName: user?.name || "",
    companyName: user?.organization || "",
    email: user?.email || "",
    phone: user?.phone || "",
    location: user?.location || "",
    vat: user?.vat || "",
  }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccess(false);
    const saved = await updateUser({
      name: formData.fullName.trim(),
      organization: formData.companyName.trim(),
      phone: formData.phone.trim(),
      location: formData.location.trim(),
      vat: formData.vat.trim(),
    });
    setIsSaving(false);
    setSuccess(saved);
  };

  const displayName = user?.name || user?.email || "Your profile";
  const workspaceName = user?.activeWorkspace === "receiver" ? "Receiver workspace" : "Provider workspace";

  return (
    <div className="relative min-h-screen pb-16">
      <PageMeta
        title="Account Profile | GreenLoop"
        description="Manage your GreenLoop account details."
      />

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow-label text-steel-500 dark:text-steel-400">Account</p>
          <h1 className="mt-1 font-archivo text-2xl font-bold tracking-tight text-ink-900 dark:text-white sm:text-3xl">Account Profile</h1>
          <p className="mt-1 max-w-2xl text-sm text-steel-600 dark:text-gray-400">Manage your profile and workspace details. This information is used across GreenLoop for projects, bookings and communications.</p>
        </div>
        <nav aria-label="Breadcrumb" className="mt-1">
          <ol className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-steel-500 dark:text-steel-400">
            <li><Link to="/" className="transition-colors hover:text-loop-700 dark:hover:text-loop-400">Home</Link></li>
            <li aria-hidden="true">›</li>
            <li className="text-ink-900 dark:text-white">Account Profile</li>
          </ol>
        </nav>
      </div>

      <PageMotion className="max-w-none space-y-3">
        <RevealItem><PlanBillingCard /></RevealItem>
        <RevealItem>
          <section className="relative min-h-36 overflow-hidden border border-[#e5e1d8] bg-[#17291e] sm:min-h-40 dark:border-steel-800 rounded-surface" aria-label="Profile overview">
            <img src={ambientMedia.sortingFacility.src} alt={ambientMedia.sortingFacility.alt} className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#17291e]/80 via-[#17291e]/40 to-[#17291e]/10" aria-hidden="true" />
            <div className="relative flex min-h-36 items-end gap-3 sm:min-h-40 sm:gap-4 gl-card-pad">
              <span className="size-[68px] shrink-0 overflow-hidden rounded-full border-2 border-white/90 bg-white shadow-sm sm:size-[76px]">
                <img src="/images/user/owner.png" alt={`${displayName} profile`} className="size-full object-cover" />
              </span>
              <div className="min-w-0 pb-1 text-white">
                <h2 className="truncate font-archivo text-lg font-bold sm:text-xl">{displayName}</h2>
                <span className="mt-1 inline-flex items-center gap-1.5 border border-white/30 bg-[#153a29]/80 px-2 py-1 text-xs font-bold uppercase tracking-[0.12em] text-white sm:text-xs">
                  <span className="size-1.5 rounded-full bg-loop-400" aria-hidden="true" />
                  {workspaceName}
                </span>
              </div>
            </div>
          </section>
        </RevealItem>

        <RevealItem>
          <section className="border border-[#e5e1d8] bg-white lg:p-7 dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
            <div className="mb-5 border-b border-steel-100 pb-4 dark:border-steel-800">
              <h2 className="font-archivo text-lg font-bold text-ink-900 dark:text-white sm:text-xl">Profile Settings</h2>
              <p className="mt-1 text-xs text-steel-600 dark:text-gray-400">Keep your contact and workspace details up to date.</p>
            </div>

            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                <ProfileField id="profile-full-name" label="Full Name">
                  <input
                    id="profile-full-name"
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  />
                </ProfileField>

                <ProfileField id="profile-company-name" label="Company / Workspace Name">
                  <input
                    id="profile-company-name"
                    type="text"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  />
                </ProfileField>

                <ProfileField id="profile-location" label="Location / Region">
                  <input id="profile-location" type="text" name="location" value={formData.location} onChange={handleChange} className={inputClass} />
                </ProfileField>

                <ProfileField id="profile-vat" label="VAT / Company Number">
                  <input id="profile-vat" type="text" name="vat" value={formData.vat} onChange={handleChange} className={inputClass} />
                </ProfileField>

                <ProfileField id="profile-email" label="Email Address">
                  <input
                    id="profile-email"
                    type="email"
                    name="email"
                    value={formData.email}
                    readOnly
                    aria-describedby="account-email-note"
                    required
                    className={`${inputClass} cursor-not-allowed bg-steel-50 text-steel-600 dark:bg-white/[0.03] dark:text-gray-400`}
                  />
                  <p id="account-email-note" className="mt-1 text-xs text-steel-500 dark:text-steel-400">Email is the sign-in identifier for your account.</p>
                </ProfileField>

                <ProfileField id="profile-phone" label="Phone Number">
                  <input id="profile-phone" type="tel" name="phone" value={formData.phone} onChange={handleChange} className={inputClass} />
                </ProfileField>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-steel-100 pt-4 dark:border-steel-800">
                <Button size="md" disabled={isSaving} type="submit" className="!rounded-md !bg-[#173c2a] !px-5 !py-2.5 !font-semibold !text-white hover:!bg-[#285e40] focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-[#39714b]">
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
                {success && (
                  <span role="status" className="text-sm font-medium text-loop-700 dark:text-loop-400">Profile saved successfully.</span>
                )}
              </div>
            </form>
          </section>
        </RevealItem>
      </PageMotion>
    </div>
  );
}

const inputClass = "mt-1.5 block h-10 w-full rounded-md border border-steel-300 bg-white px-3 text-sm text-ink-900 shadow-none outline-none transition-colors placeholder:text-steel-400 focus:border-loop-600 focus:ring-2 focus:ring-loop-600/15 dark:border-steel-700 dark:bg-[#101a14] dark:text-white";

function ProfileField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-semibold text-steel-700 dark:text-gray-300">{label}</label>
      {children}
    </div>
  );
}
