import PageMeta from "@/components/common/PageMeta";
import { PageMotion, RevealItem } from "@/components/greenloop/kit";
import { useAuth } from "@/context/AuthContext.helpers";
import { AVAILABLE_LANGUAGES, type LanguageCode, useLanguage } from "@/context/LanguageContext.helpers";
import { useTheme } from "@/context/ThemeContext.helpers";
import { useNavigate } from "react-router";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen pb-24">
      <PageMeta title="Settings | GreenLoop" description="Manage your GreenLoop application preferences." />

      <PageMotion className="mx-auto max-w-3xl space-y-6">
        <RevealItem>
          <header className="border-b border-steel-200 pb-6 dark:border-steel-800">
            <p className="eyebrow-label text-loop-600 dark:text-loop-400">Your preferences</p>
            <h1 className="mt-3 font-archivo text-3xl font-bold tracking-tight text-ink-900 dark:text-white">Settings</h1>
            <p className="mt-2 text-sm text-steel-600 dark:text-gray-400">
              These preferences are saved in this browser and apply to both workspaces.
            </p>
          </header>
        </RevealItem>

        <RevealItem>
          <section className="border border-steel-200 bg-white dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Appearance</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-archivo font-bold text-ink-900 dark:text-white">Theme</p>
                <p className="mt-1 text-sm text-steel-600 dark:text-gray-400">Currently using {theme} mode.</p>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-sm border border-steel-300 px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-gray-50 dark:border-steel-700 dark:text-white dark:hover:bg-white/5"
              >
                Switch to {theme === "dark" ? "light" : "dark"} theme
              </button>
            </div>
          </section>
        </RevealItem>

        <RevealItem>
          <section className="border border-steel-200 bg-white dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Language</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-archivo font-bold text-ink-900 dark:text-white">Interface language</p>
                <p className="mt-1 text-sm text-steel-600 dark:text-gray-400">Applies to menus and labels across GreenLoop.</p>
              </div>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as LanguageCode)}
                aria-label="Interface language"
                className="border border-steel-300 bg-transparent px-3 py-2 text-sm font-semibold text-ink-900 dark:border-steel-700 dark:bg-black dark:text-white rounded-surface"
              >
                {AVAILABLE_LANGUAGES.map((item) => (
                  <option key={item.code} value={item.code}>{item.name}</option>
                ))}
              </select>
            </div>
          </section>
        </RevealItem>

        <RevealItem>
          <section className="border border-steel-200 bg-white dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Session</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-archivo font-bold text-ink-900 dark:text-white">
                  {user?.activeWorkspace === "receiver" ? "Material Receiver workspace" : "Material Provider workspace"}
                </p>
                <p className="mt-1 text-sm text-steel-600 dark:text-gray-400">Signed in as {user?.email ?? "local demo user"}.</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!await logout()) return;
                  navigate("/sign-in");
                }}
                className="rounded-sm border border-signal-300 px-4 py-2 text-sm font-semibold text-signal-700 hover:bg-signal-50 dark:border-signal-500/40 dark:text-signal-300 dark:hover:bg-signal-500/10"
              >
                Sign out
              </button>
            </div>
          </section>
        </RevealItem>
      </PageMotion>
    </div>
  );
}
