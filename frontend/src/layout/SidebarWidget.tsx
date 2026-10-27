import { ambientMedia } from "@/config/appMedia";
import { useAuth } from "@/context/AuthContext.helpers";
import { Link } from "react-router";

export default function SidebarWidget() {
  const { user } = useAuth();
  const isReceiver = user?.activeWorkspace === "receiver";
  return (
    <Link to={isReceiver ? "/app/receiver/demand" : "/app/projects"} className="group relative mx-3 mb-4 mt-5 block min-h-28 overflow-hidden rounded-xl bg-[#233b2f]">
      <img src={ambientMedia.brickPallets.src} alt={ambientMedia.brickPallets.alt} loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      <span className="absolute inset-0 bg-[#12251b]/65" aria-hidden="true" />
      <span className="relative block p-4 text-white">
        <span className="block max-w-40 font-archivo text-sm font-semibold leading-5">Turning construction waste into opportunity.</span>
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#c9e1cf]">{isReceiver ? "Request material" : "Explore projects"} <span aria-hidden="true">→</span></span>
      </span>
    </Link>
  );
}
