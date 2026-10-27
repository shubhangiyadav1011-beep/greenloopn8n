import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import PageMeta from "@/components/common/PageMeta";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { api } from "@/lib/api";
export default function ForgotPassword() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setError("");
    if (token && (password.length < 8 || password !== confirmation)) { setError(t("backend.passwordMismatch")); return; }
    setBusy(true);
    try {
      await api(token ? "/auth/reset-password" : "/auth/forgot-password", "POST", token ? { token, password } : { email });
      setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("backend.requestFailed")); }
    finally { setBusy(false); }
  };
  return <div className="flex min-h-screen items-center justify-center bg-white p-4 dark:bg-gray-900">
    <PageMeta title="Password recovery | GreenLoop" description="Recover access to your GreenLoop account." />
    <div className="w-full max-w-md space-y-6 rounded-lg border border-steel-200 p-6 dark:border-steel-800">
      <h1 className="font-archivo text-2xl font-bold text-ink-900 dark:text-white">{t("backend.passwordRecovery")}</h1>
      {done ? <p role="status" className="text-steel-600 dark:text-steel-400">{t(token ? "backend.passwordChanged" : "backend.resetSent")}</p> :
        <form onSubmit={handleSubmit} className="space-y-5">
          {token ? <>
            <div><Label>{t("backend.newPassword")}</Label><Input type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
            <div><Label>{t("backend.confirmPassword")}</Label><Input type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></div>
          </> : <div><Label>Email</Label><Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>}
          {error && <p role="alert" className="text-error-500">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">{t(token ? "backend.savePassword" : "backend.sendReset")}</Button>
        </form>}
      <Link to="/sign-in" className="block text-loop-600 underline dark:text-loop-400">{t("backend.backToSignIn")}</Link>
    </div>
  </div>;
}
