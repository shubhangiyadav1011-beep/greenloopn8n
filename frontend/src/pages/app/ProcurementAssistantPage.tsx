import PageMeta from "@/components/common/PageMeta";
import ProcurementAssistant from "@/components/greenloop/ProcurementAssistant";
import { useSearchParams } from "react-router";

export default function ProcurementAssistantPage() {
  const [searchParams] = useSearchParams();
  const materialId = searchParams.get("materialId") || undefined;
  const prompt = searchParams.get("q") || undefined;

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      <PageMeta
        title="Contextual Procurement Assistant | GreenLoop"
        description="Conversational procurement assistant connected to live inventory, smart matching, and landed-cost calculations."
      />
      <ProcurementAssistant
        initialMaterialId={materialId}
        initialPrompt={prompt}
        fullScreen={true}
      />
    </div>
  );
}
