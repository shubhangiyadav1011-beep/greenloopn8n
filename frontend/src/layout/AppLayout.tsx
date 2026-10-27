import { SidebarProvider } from "@/context/SidebarContext";
import { useSidebar } from "@/context/SidebarContext.helpers";
import { cn } from "@/utils";
import { Outlet, useLocation } from "react-router";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import Backdrop from "./Backdrop";
import FloatingAssistant from "./FloatingAssistant";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { pathname } = useLocation();
  const isWorkspaceHome = pathname === "/app/explore" || pathname === "/app/receiver/overview";
  const isInventory = pathname === "/app/materials";
  const isActiveDemand = pathname === "/app/market-demand";
  const isReceiverDemand = pathname === "/app/receiver/demand";
  const isProviderDirectory = pathname === "/app/receiver/providers";
  const isMyOrders = pathname === "/app/bookings-deliveries" || pathname.startsWith("/app/orders");
  const isReceiverVerification = pathname === "/app/receiver/verification";
  const isAssistant = pathname.includes("/assistant");

  return (
    <div className="relative min-h-screen bg-[#f6f5f0] text-[#26342b] transition-colors duration-300 dark:bg-[#101913] dark:text-[#f2f3ef] xl:flex">
      <div className="relative z-10 flex min-h-screen w-full xl:flex">
        <AppSidebar />
      <Backdrop />

      <div
        className={cn(
          "relative min-w-0 flex-1 transition-[margin] duration-300 ease-in-out",
          isExpanded || isHovered ? "xl:ms-72.5" : "xl:ms-22.5",
          isMobileOpen ? "ms-0" : "",
        )}
      >
        <AppHeader overlay={isWorkspaceHome || isActiveDemand || isReceiverDemand || isProviderDirectory || isMyOrders} lightOverlay={isMyOrders} />
        <main
          className={cn(
            "greenloop-workspace mx-auto w-full",
            isWorkspaceHome
              ? "max-w-none p-0"
              : isInventory
                ? "max-w-none p-0"
              : isActiveDemand
                ? "max-w-none p-0"
              : isReceiverDemand
                ? "max-w-none p-0"
              : isProviderDirectory || isMyOrders || isReceiverVerification || isAssistant
                ? "max-w-none p-0"
              : "max-w-app p-4 sm:p-card xl:p-section",
          )}
        >
          <Outlet />
        </main>
      </div>
      </div>
      <FloatingAssistant />
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
