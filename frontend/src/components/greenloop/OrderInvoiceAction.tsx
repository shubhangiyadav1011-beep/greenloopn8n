import Button from "@/components/ui/button/Button";
import { generateOrderInvoice, type OrderInvoiceData } from "@/lib/orderInvoice";
import { useEffect, useState } from "react";

export default function OrderInvoiceAction({
  invoice,
}: {
  invoice: OrderInvoiceData;
}) {
  const [pdfUrl, setPdfUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  const generate = async () => {
    setIsGenerating(true);
    setError("");
    try {
      const generated = await generateOrderInvoice(invoice);
      setPdfUrl(URL.createObjectURL(generated.blob));
      setFileName(generated.fileName);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Order summary could not be generated: ${cause.message}`
          : "Order summary could not be generated. Please try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-steel-200 pt-4 dark:border-steel-800">
      <Button
        size="sm"
        variant="primary"
        onClick={generate}
        disabled={isGenerating}
      >
        {isGenerating ? "Generating PDF…" : pdfUrl ? "Generate Again" : "Order / Payment Summary"}
      </Button>
      {pdfUrl && (
        <div className="flex flex-wrap items-center gap-3" aria-live="polite">
          <span className="text-sm font-medium text-loop-700 dark:text-loop-300">
            Order / Payment Summary PDF is ready.
          </span>
          <a
            href={pdfUrl}
            download={fileName}
            className="text-sm font-semibold text-ink-700 underline underline-offset-4 hover:text-loop-700 dark:text-gray-200 dark:hover:text-loop-300"
          >
            Download PDF
          </a>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-ink-700 underline underline-offset-4 hover:text-loop-700 dark:text-gray-200 dark:hover:text-loop-300"
          >
            Open PDF
          </a>
        </div>
      )}
      {error && (
        <p role="alert" className="w-full text-sm text-error-700 dark:text-error-300">
          {error}
        </p>
      )}
    </div>
  );
}
