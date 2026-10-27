import type { SystemRole } from "@/context/AuthContext.helpers";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  organization: string;
  workspaces: string[];
  status: "active" | "suspended";
  statusUpdatedAt?: string;
  statusReason?: string;
  systemRole: SystemRole | null;
}

export interface AdminTicket {
  ticketId: string;
  requesterUserId: string;
  requesterEmail: string;
  requesterName?: string;
  status: "open" | "in_review" | "waiting" | "resolved";
  assignedAdminUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  subject: string;
  message: string;
}

export interface AdminAuditEntry {
  id: number;
  actorUserId: string;
  actorRole: SystemRole;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  occurredAt: string;
  reason: string;
  before?: unknown;
  after?: unknown;
}

export interface AdminOrderSummary {
  booking: { id: string; status: string; tonnesT: number; createdAt: string; materialId: string; loadRef?: string; offerId?: string; agreementVersionId?: string; agreedPricePerT?: number };
  participants: { provider?: { id: string; name: string; organization: string; email: string }; receiver?: { id: string; name: string; organization: string; email: string } };
  material?: { type: string; projectId: string };
  delivery?: { status: string; acceptedT: number; rejectedT: number };
  payment?: { paymentStatus: string; refundStatus: string; payoutStatus: string };
  dispatch: { dispatched: boolean; loadReference?: string; events?: { at: string; kind: string; summary: string }[] };
}

export interface AdminOrderDetail extends AdminOrderSummary {
  booking: AdminOrderSummary["booking"] & { receiverAcceptedAt?: string; receiverId: string };
  negotiation: { offerId?: string; offerStatus?: string; approvedVersion?: { id?: string; version?: number; status?: string; quantityT?: number; pricePerT?: number; destination?: string; slotId?: string }; versions: { id?: string; version?: number; status?: string; quantityT?: number; pricePerT?: number; destination?: string; slotId?: string; createdAt?: string }[] };
  delivery?: AdminOrderSummary["delivery"] & { id: string; plannedT: number; actualT: number; verifiedAt?: string };
  payment?: AdminOrderSummary["payment"] & { attemptId: string; provider: string; providerReference: string; amountMinor: number; currency: string; acceptedValueMinor: number; commissionMinor: number; providerFeeMinor: number; refundAmountMinor: number; payoutAmountMinor: number; disputedAt?: string; disputeReason?: string };
}
