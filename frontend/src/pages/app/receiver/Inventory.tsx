import PageMeta from "@/components/common/PageMeta";
import { materialMediaFor } from "@/config/appMedia";
import { useAuth } from "@/context/AuthContext.helpers";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { formatDate, formatINR, formatINRPerT } from "@/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { Link } from "react-router";

export default function ReceiverInventory() {
  const { dataset } = useGreenLoopStore();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const cardsRef = useRef<HTMLUListElement>(null);
  const receiverId = user?.receiverId ?? "";
  const records = useMemo(() => {
    const verifications = dataset.verifications.filter((record) => record.receiverId === receiverId && record.status === "verified");
    const materialIds = new Set(verifications.map((record) => record.materialId));
    const normalizedQuery = query.trim().toLowerCase();
    return dataset.materials.filter((material) => materialIds.has(material.id) && (!normalizedQuery || `${material.type} ${material.id} ${material.condition}`.toLowerCase().includes(normalizedQuery))).map((material) => {
      const verificationsForMaterial = verifications.filter((record) => record.materialId === material.id);
      const receivedT = verificationsForMaterial.reduce((total, record) => total + record.actualT, 0);
      const verified = verificationsForMaterial.filter((record) => record.status === "verified");
      const acceptedT = verified.reduce((total, record) => total + record.acceptedT, 0);
      const priced = verified.reduce((result, record) => {
        const booking = dataset.bookings.find((item) => item.id === record.bookingId);
        const offer = booking?.demandId ? dataset.offers?.find((item) => item.demandId === booking.demandId && item.passportId === material.id) : undefined;
        const unitPrice = booking?.agreedPricePerT ?? offer?.agreedPricePerT ?? offer?.pricePerT ?? material.pricePerT;
        return unitPrice === undefined ? result : { tonnes: result.tonnes + record.acceptedT, value: result.value + unitPrice * record.acceptedT };
      }, { tonnes: 0, value: 0 });
      return { material, receivedT, acceptedT, acceptedValueT: priced.tonnes, acceptedValue: priced.value, latestReceipt: [...verificationsForMaterial].sort((a, b) => (b.verifiedAt ?? "").localeCompare(a.verifiedAt ?? ""))[0] };
    });
  }, [dataset.bookings, dataset.materials, dataset.offers, dataset.verifications, receiverId, query]);
  const totalAcceptedT = records.reduce((total, row) => total + row.acceptedT, 0);

  useEffect(() => {
    const cards = cardsRef.current?.querySelectorAll<HTMLElement>("[data-inventory-card]");
    if (!cards?.length) return;

    const entrance = animate(cards, {
      opacity: [0, 1],
      translateY: [20, 0],
      delay: stagger(80),
      duration: 600,
      ease: "out(3)",
    });

    return () => {
      entrance.revert();
    };
  }, [records]);

  return (
    <main className="mx-auto max-w-app pb-16">
      <PageMeta title="Receiver Inventory | GreenLoop" description="Review material received and verified by your facility." />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-steel-200 pb-5 dark:border-steel-800"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-loop-700 dark:text-loop-300">Receiver workspace</p><h1 className="mt-2 font-archivo text-3xl font-bold text-ink-900 dark:text-white">Inventory</h1></div><div className="text-end"><p className="text-xs uppercase tracking-wide text-steel-500">Accepted stock recorded</p><p className="mt-1 font-archivo text-2xl font-bold text-ink-900 dark:text-white">{totalAcceptedT.toLocaleString("en-IN")} t</p></div></header>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-steel-600 dark:text-gray-400">{records.length} received materials</p><label className="w-full sm:w-72"><span className="sr-only">Search receiver inventory</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search material or passport ID" className="h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white" /></label></div>
      {records.length ? <ul ref={cardsRef} className="grid gap-card sm:grid-cols-2 xl:grid-cols-3">{records.map(({ material, receivedT, acceptedT, acceptedValueT, acceptedValue, latestReceipt }) => {
        const media = materialMediaFor(material.type);
        return <li key={material.id} data-inventory-card className="overflow-hidden border border-steel-200 bg-white dark:border-steel-800 dark:bg-[#17251d] rounded-surface"><img src={media.src} alt={media.alt} loading="lazy" className="h-40 w-full object-cover" /><div className="gl-card-pad"><div className="flex items-start justify-between gap-3"><h2 className="font-archivo text-xl font-bold capitalize text-ink-900 dark:text-white">{material.type}</h2><span className="text-xs font-semibold text-loop-700 dark:text-loop-300">{acceptedT.toLocaleString("en-IN")} t accepted</span></div><p className="mt-1 text-xs text-steel-500">Passport {material.id} · {material.condition} condition · Grade {material.grade}</p><div className="mt-3 grid grid-cols-2 gap-2 border-y border-steel-100 py-3 text-xs dark:border-steel-800"><span>Received<strong className="mt-1 block text-ink-900 dark:text-white">{receivedT.toLocaleString("en-IN")} t</strong></span><span>Last receipt<strong className="mt-1 block text-ink-900 dark:text-white">{formatDate(latestReceipt?.verifiedAt ?? "") || "—"}</strong></span>{material.pricePerT !== undefined && <span>Reference price<strong className="mt-1 block text-ink-900 dark:text-white">{formatINRPerT(material.pricePerT)}</strong></span>}{acceptedValueT > 0 ? <span>Priced accepted value<strong className="mt-1 block text-ink-900 dark:text-white">{formatINR(acceptedValue)}</strong></span> : <span>Transaction value<strong className="mt-1 block text-ink-900 dark:text-white">Price on request</strong></span>}</div><Link to={`/app/materials/${material.id}`} className="mt-3 inline-flex text-sm font-semibold text-loop-700 underline dark:text-loop-300">Open passport</Link></div></li>;
      })}</ul> : <div className="border border-dashed border-steel-300 bg-white/60 px-6 py-12 text-center dark:border-steel-700 dark:bg-white/[0.02] rounded-surface"><h2 className="font-archivo text-lg font-bold text-ink-900 dark:text-white">{dataset.verifications.some((record) => record.receiverId === receiverId) ? "No inventory matches your search" : "No verified material in inventory yet"}</h2><p className="mt-2 text-sm text-steel-600 dark:text-gray-400">Received material will appear here when a delivery is verified.</p><Link to="/app/receiver/deliveries" className="mt-4 inline-flex text-sm font-semibold text-loop-700 underline dark:text-loop-300">View Deliveries</Link></div>}
    </main>
  );
}
