import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext.helpers";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function Support() {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const { user } = useAuth();
  const { dataset, addSupportRequestAction } = useGreenLoopStore();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setFormError("Enter a subject and message before submitting.");
      return;
    }
    setFormError("");
    setIsSubmitting(true);
    const request = await addSupportRequestAction({ email: user?.email ?? "", subject: subject.trim(), message: message.trim() });
    if (!request) { setIsSubmitting(false); return; }
    setSubmittedId(request.id);
    setSubject("");
    setMessage("");
    setIsSubmitting(false);
  };

  return (
    <div className="relative min-h-screen pb-24">
      <PageMeta
        title="Support | GreenLoop"
        description="Get help and contact support."
      />
      <PageBreadCrumb pageTitle="Support" />

      <div className="mx-auto max-w-3xl space-y-8">
        
        {/* Help Information */}
        <section className="border border-steel-200 bg-white p-8 dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
          <h2 className="mb-4 font-archivo text-xl font-bold text-ink-900 dark:text-white">GreenLoop Workflow Help</h2>
          <div className="prose prose-sm max-w-none text-ink-800 dark:text-gray-300">
            <p className="mb-4">
              GreenLoop connects construction material providers with receivers to keep materials in the circular economy.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Providers:</strong> Survey materials, create Material Passports, and find Receivers with capacity to take them.</li>
              <li><strong>Receivers:</strong> Publish Material Requests to indicate demand, or accept Incoming Capacity Requests from Providers.</li>
            </ul>
            <p className="mt-4">
              Ensure you switch between Provider and Receiver workspaces using the user menu in the top right to access role-specific features.
            </p>
          </div>
        </section>

        {/* Contact Form */}
        <section className="border border-steel-200 bg-white p-8 dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
          <h2 className="mb-6 font-archivo text-xl font-bold text-ink-900 dark:text-white">Contact Support</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label>Subject</Label>
              <Input 
                type="text" 
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                placeholder="Briefly describe your issue"
              />
            </div>
            
            <div>
              <Label>Message</Label>
              <textarea 
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={5}
                className="mt-1 block w-full rounded-sm border-steel-300 p-3 shadow-sm focus:border-loop-500 focus:ring-loop-500 sm:text-sm dark:border-steel-700 dark:bg-black dark:text-white"
                placeholder="How can we help?"
              />
            </div>

            <div className="flex items-center gap-4 pt-2">
              <Button size="md" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
              {formError && <span role="alert" className="text-sm text-error-500">{formError}</span>}
              {submittedId && (
                <span role="status" className="text-sm font-medium text-loop-600 dark:text-loop-400">
                  Support request {submittedId} saved to your GreenLoop account.
                </span>
              )}
            </div>
          </form>
        </section>

        {(dataset.supportRequests ?? []).filter((request) => request.email === user?.email).length > 0 && (
          <section className="border border-steel-200 bg-white p-8 dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
            <h2 className="mb-4 font-archivo text-xl font-bold text-ink-900 dark:text-white">Your support requests</h2>
            <div className="space-y-4">
              {(dataset.supportRequests ?? []).filter((request) => request.email === user?.email).map((request) => (
                <article key={request.id} className="border-t border-steel-100 pt-4 dark:border-steel-800">
                  <p className="font-semibold text-ink-900 dark:text-white">{request.subject} · {request.id}</p>
                  <p className="mt-1 text-sm font-medium text-loop-700 dark:text-loop-300">{t("supportTicket.statusLabel")}: {t(`supportTicket.status.${request.status ?? "open"}`)}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-steel-600 dark:text-gray-400">{request.message}</p>
                  <p className="mt-2 text-xs text-steel-500">{t("supportTicket.updated")}: {new Date(request.updatedAt ?? request.submittedAt).toLocaleString()}{request.resolvedAt ? ` · ${t("supportTicket.resolved")}: ${new Date(request.resolvedAt).toLocaleString()}` : ""}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
