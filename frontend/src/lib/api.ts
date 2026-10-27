import i18n from "@/i18n";
export async function api<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method, credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-GreenLoop-Client": "web" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json().catch(() => ({ error: i18n.t("backend.serverUnavailable") }));
  if (!response.ok) throw new Error(result.error ?? "The request failed.");
  return result as T;
}
export async function uploadFile(file: File): Promise<string> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(i18n.t("backend.readFileFailed")));
    reader.readAsDataURL(file);
  });
  return (await api<{ ref: string }>("/uploads", "POST", { name: file.name, data })).ref;
}
