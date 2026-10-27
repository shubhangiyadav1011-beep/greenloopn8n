import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "react-router";
import { useAuth } from "@/context/AuthContext.helpers";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import {
  parseProcurementPrompt,
  queryContextualProcurement,
  type AssistantMessage,
  type AssistantCardData,
} from "@shared/domain/procurementAssistant";
import { formatINRPerT, formatDate, materialTypeLabel } from "@/utils";

interface QuickAction {
  id: string;
  label: string;
  icon: (className?: string) => React.ReactNode;
  prompt: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "find-materials",
    label: "Find materials for your project",
    prompt: "Find materials for your project",
    icon: (className = "size-4") => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    id: "check-availability",
    label: "Check material availability",
    prompt: "Check material availability",
    icon: (className = "size-4") => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    id: "compare-cost",
    label: "Compare landed cost",
    prompt: "Compare landed cost",
    icon: (className = "size-4") => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    id: "material-passports",
    label: "Understand Material Passports",
    prompt: "Understand Material Passports",
    icon: (className = "size-4") => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    id: "track-orders",
    label: "Track your orders",
    prompt: "Track your orders",
    icon: (className = "size-4") => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
];

export default function FloatingAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const { dataset } = useGreenLoopStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const firstName = user?.name ? user.name.split(" ")[0] : "Somya";
  const userLocation = user?.location || "Whitefield, Bengaluru";

  // Auto-scroll on new message
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isProcessing]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // If on full page assistant, hide the floating widget
  if (location.pathname.includes("/assistant")) {
    return null;
  }

  const handleSendMessage = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text) return;

    const userMsg: AssistantMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      timestamp: new Date().toISOString(),
      text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsProcessing(true);

    try {
      // Natural brief delay
      await new Promise((res) => setTimeout(res, 400));

      let assistantMsg: AssistantMessage;

      // Parse intent using deterministic engine
      const parsed = parseProcurementPrompt(text, { location: userLocation });

      // Handle specific intents
      if (parsed.intent === "create_passport") {
        const matType = parsed.extracted.materialType;
        const matLabel = matType ? materialTypeLabel(matType) : "Reclaimed Material";
        const formUrl = matType ? `/app/materials/new?type=${encodeURIComponent(matType)}` : "/app/materials/new";

        assistantMsg = {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          timestamp: new Date().toISOString(),
          text: `**Create a Digital Material Passport**\n\nTo create and register a new Material Passport for **${matLabel}**, proceed to the survey intake workflow in your Provider Hub:\n\n1. **Material Classification:** Input structural grade, estimated recoverable tonnage, and physical condition.\n2. **Quality Documentation:** Upload mill certificates, lab tests (IS 383, IS 2062, IS 3495), or demolition survey photos.\n3. **Passport Activation:** Generate an authenticated digital passport with an immutable QR code ready for market matching.\n\n[+ Open Passport Creation Form →](${formUrl})`,
          intent: "create_passport",
        };
      } else if (parsed.intent === "check_orders") {
        const userOrders = dataset.bookings.filter((b) => b.status !== "cancelled");
        if (userOrders.length === 0) {
          assistantMsg = {
            id: `asst-${Date.now()}`,
            sender: "assistant",
            timestamp: new Date().toISOString(),
            text: `**No Active Orders Found**\n\nYou currently have **0 active shipments** or scheduled deliveries in your workspace.\n\n**Recommended Next Actions:**\n• Browse verified materials in live inventory to place an order.\n• Or post a material demand to match with nearby demolitions.`,
            intent: "check_orders",
          };
        } else {
          const list = userOrders
            .slice(0, 3)
            .map((b) => {
              const mat = dataset.materials.find((m) => m.id === b.materialId);
              const name = mat?.type ? materialTypeLabel(mat.type) : `Batch #${b.materialId}`;
              return `• **Order #${b.id}** — **${b.tonnesT} t** of **${name}**\n  - **Status:** \`${b.status.toUpperCase()}\``;
            })
            .join("\n\n");
          assistantMsg = {
            id: `asst-${Date.now()}`,
            sender: "assistant",
            timestamp: new Date().toISOString(),
            text: `**Active Orders & Delivery Schedule**\n\nFound **${userOrders.length} active order(s)** on file for your workspace:\n\n${list}\n\nYou can track real-time milestones and delivery receipts in the [My Orders](/app/bookings-deliveries) page.`,
            intent: "check_orders",
          };
        }
      } else if (parsed.intent === "check_compliance") {
        assistantMsg = {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          timestamp: new Date().toISOString(),
          text: `**GreenLoop Material Passports** provide cryptographically verified proof of quality and circular origin for all reclaimed construction materials.\n\n• **ISO & IS Testing**: Verified compressive strength, moisture absorption, and sieve grading.\n• **Chain of Custody**: Traceability from demolition site to certified intake hub.\n• **Embodied Carbon**: Up to 42% carbon reduction verified vs virgin materials.\n\nEvery batch includes an immutable QR code tag for on-site inspection.`,
          intent: "check_compliance",
        };
      } else if (parsed.intent === "compare_costs") {
        assistantMsg = {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          timestamp: new Date().toISOString(),
          text: `**Landed Cost Savings vs Virgin Benchmarks**:\n\n• **Crushed Concrete (IS 383 Grade A)**:\n  - Delivered Landed: **₹920/tonne**\n  - Virgin Aggregate: **₹1,450/tonne**\n  - **Savings: 36.5%**\n\n• **Structural Steel Beams (IS 2062)**:\n  - Delivered Landed: **₹42,500/tonne**\n  - Virgin Structural Steel: **₹68,000/tonne**\n  - **Savings: 37.5%**\n\n*Landed costs include transport, transit insurance, handling, and GST.*`,
          intent: "compare_costs",
        };
      } else if (text.toLowerCase().includes("how to use") || text.toLowerCase().includes("website guide") || text.toLowerCase().includes("what can you do")) {
        assistantMsg = {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          timestamp: new Date().toISOString(),
          text: `**Welcome to GreenLoop!** Here is how you can use the platform:\n\n• **Marketplace & Discovery**: Browse live circular materials with landed costs ([Explore Materials](/app/explore))\n• **Inventory & Passports**: Register demolished materials and generate digital passports ([View Inventory](/app/materials))\n• **Demand Matching**: Post project requirements for automated provider matching ([Active Demand](/app/market-demand))\n• **Orders & Deliveries**: Track real-time shipments and dispatch ([My Orders](/app/bookings-deliveries))\n• **Verification**: Inspect certified IS test evidence and chain-of-custody ledger ([Verification Hub](/app/verification))`,
          intent: "general_help",
        };
      } else {
        // Query contextual engine with live dataset
        const cards = queryContextualProcurement(dataset, parsed.extracted, userLocation);
        const topCards = cards.slice(0, 3);
        if (topCards.length > 0) {
          assistantMsg = {
            id: `asst-${Date.now()}`,
            sender: "assistant",
            timestamp: new Date().toISOString(),
            text: `Found **${cards.length} verified material options** matching your inquiry in the ${userLocation} zone:`,
            intent: "search_materials",
            cards: topCards,
          };
        } else {
          assistantMsg = {
            id: `asst-${Date.now()}`,
            sender: "assistant",
            timestamp: new Date().toISOString(),
            text: `I've registered your requirement for **${text}**.\n\nOur smart matching engine is monitoring live demolitions and partner hub arrivals. You can also view all available batches in the [Inventory](/app/materials) tab or create a passport via [+ Add Material](/app/materials/new).`,
            intent: "general_help",
          };
        }
      }

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "assistant",
          timestamp: new Date().toISOString(),
          text: "I couldn't process that query right now. Please try again or select one of the suggested options.",
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInputText("");
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Floating Chatbot Window */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="GreenLoop Assistant"
          className="fixed bottom-24 right-6 z-50 flex flex-col w-[390px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-8rem)] rounded-2xl border border-white/10 bg-[#0d1713]/95 shadow-[0_20px_60px_rgba(0,0,0,0.85),0_0_35px_rgba(0,229,153,0.15)] overflow-hidden backdrop-blur-2xl transition-all duration-200 animate-in fade-in slide-in-from-bottom-5"
        >
          {/* Header Bar */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0d1713] px-4 py-3">
            <div>
              <h3 className="font-archivo text-sm font-bold text-white tracking-tight">
                GreenLoop Assistant
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="size-1.5 rounded-full bg-[#00e599] shadow-[0_0_6px_#00e599]" />
                <span className="text-[11px] text-white/60 font-medium">Online</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="size-7 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors text-xs"
                  title="Return to Menu"
                  aria-label="Return to Menu"
                >
                  ↺
                </button>
              )}
              <Link
                to={user?.activeWorkspace === "receiver" ? "/app/receiver/assistant" : "/app/assistant"}
                onClick={() => setIsOpen(false)}
                className="size-7 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors"
                title="Expand to Fullscreen"
                aria-label="Expand to Fullscreen"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              </Link>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="size-7 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors text-xs font-bold"
                title="Minimize"
                aria-label="Minimize"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="size-7 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors text-xs font-bold"
                title="Close"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body Section */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {messages.length === 0 ? (
              /* Welcome Greeting & 5 Action Buttons */
              <div className="flex items-start gap-3">
                {/* GreenLoop Logo Avatar */}
                <div className="size-8 rounded-full bg-[#122319] border border-[#00e599]/40 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                  <svg className="size-4.5 text-[#00e599]" viewBox="0 0 32 32" fill="none">
                    <path d="M22.5 9.5a9 9 0 1 0 2.6 6.4" stroke="#00e599" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <circle cx="16" cy="16" r="2.5" fill="#00e599" />
                  </svg>
                </div>

                {/* Message Bubble Card */}
                <div className="flex-1 rounded-2xl border border-white/10 bg-[#122018]/90 p-4 text-white shadow-sm">
                  <h4 className="font-archivo text-sm font-bold text-white">
                    Hi {firstName}! 👋
                  </h4>
                  <p className="text-xs text-white/70 mt-1 mb-3.5">
                    I'm your GreenLoop assistant. I can help you with:
                  </p>

                  <div className="space-y-2">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => handleSendMessage(action.prompt)}
                        className="group w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-white/5 bg-[#172920]/80 hover:bg-[#1f372b] hover:border-[#00e599]/40 transition-all text-xs font-medium text-white/90 cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[#00e599] shrink-0">
                            {action.icon("size-4")}
                          </span>
                          <span className="truncate">{action.label}</span>
                        </div>
                        <span className="text-white/40 group-hover:text-[#00e599] group-hover:translate-x-0.5 transition-all text-xs font-bold shrink-0">
                          →
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Active Conversation Stream */
              <div className="space-y-3.5">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col gap-1.5 ${
                      msg.sender === "user" ? "ml-auto items-end max-w-[85%]" : "mr-auto items-start max-w-[95%]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-white/40 px-1">
                      <span>{msg.sender === "user" ? "You" : "GreenLoop Assistant"}</span>
                      <span>•</span>
                      <span>{formatDate(msg.timestamp)}</span>
                    </div>

                    <div
                      className={`rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                        msg.sender === "user"
                          ? "bg-[#1b382b] text-white border border-[#00e599]/30 rounded-tr-xs"
                          : "bg-[#122018] text-white/90 border border-white/10 rounded-tl-xs"
                      }`}
                    >
                      <div className="prose prose-invert prose-xs max-w-none space-y-1.5 whitespace-pre-line">
                        {msg.text}
                      </div>

                      {/* Display Matched Material Cards if any */}
                      {msg.cards && msg.cards.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {msg.cards.slice(0, 2).map((card: AssistantCardData) => {
                            const mat = card.material;
                            const matId = "id" in mat ? mat.id : mat.materialId;
                            const matName = ("name" in mat && mat.name) || "Reclaimed Material";
                            const unitPrice = ("pricePerT" in mat ? mat.pricePerT : undefined) ?? 800;

                            return (
                              <div
                                key={matId}
                                className="rounded-xl border border-white/10 bg-black/30 p-2.5 text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between font-bold text-white">
                                  <span className="truncate">{matName}</span>
                                  <span className="text-[#00e599] font-mono text-[11px] shrink-0">
                                    {formatINRPerT(unitPrice)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-white/60">
                                  <span>Landed: {formatINRPerT(card.landedCost.reusableLandedCostPerT || unitPrice + 350)}</span>
                                  <span className="text-[#00e599] font-semibold">
                                    {card.savingsVsVirgin ? `Save ${card.savingsVsVirgin.percent}%` : "Verified"}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isProcessing && (
                  <div className="mr-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-[#122018] px-3.5 py-2.5 text-xs text-white/70">
                    <span className="size-2 rounded-full bg-[#00e599] animate-ping" />
                    <span>Analyzing live inventory and landed costs...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Footer Input Bar */}
          <div className="shrink-0 border-t border-white/10 bg-[#0d1713] p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(inputText);
              }}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-[#14231b] px-3.5 py-1.5 focus-within:border-[#00e599]/50 transition-colors"
            >
              {/* Attachment Icon */}
              <button
                type="button"
                className="text-white/40 hover:text-white/70 transition-colors shrink-0"
                title="Attach specification or file"
                aria-label="Attach file"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>

              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask anything about materials, costs, or orders..."
                className="flex-1 bg-transparent text-xs text-white placeholder-white/40 focus:outline-none"
              />

              {/* Circular Send Button */}
              <button
                type="submit"
                disabled={isProcessing || !inputText.trim()}
                className="size-7 rounded-full bg-white/10 hover:bg-[#00e599] disabled:opacity-40 disabled:hover:bg-white/10 text-white/70 hover:text-[#0d1713] flex items-center justify-center transition-all shrink-0 cursor-pointer"
                title="Send"
                aria-label="Send"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Bottom-Right Launcher Button with Glowing Green Ring */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="group relative flex size-14 items-center justify-center rounded-full border-2 border-[#00e599] bg-[#0c1813] text-[#00e599] shadow-[0_0_24px_rgba(0,229,153,0.45)] backdrop-blur-md transition-all duration-300 hover:scale-108 hover:shadow-[0_0_32px_rgba(0,229,153,0.7)] active:scale-95 focus:outline-none cursor-pointer"
        aria-label="Toggle GreenLoop Assistant"
        title="Open GreenLoop Assistant"
      >
        {/* Chat Speech Bubble Icon */}
        <svg
          className="size-6 text-[#00e599] transition-transform duration-300 group-hover:scale-110"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
        </svg>
      </button>
    </div>
  );
}
