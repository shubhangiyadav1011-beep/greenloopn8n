export interface InvoiceParty {
  name?: string;
  organization?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
}

export interface OrderInvoiceData {
  bookingId: string;
  invoiceDate: Date;
  orderDate: string;
  loadReference?: string;
  provider: InvoiceParty;
  receiver: InvoiceParty;
  projectName?: string;
  projectLocation?: string;
  materialId: string;
  materialType: string;
  quantityT: number;
  unitPricePerT?: number;
  payment?: import("@shared/domain/types").BookingPayment;
}

function printable(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[₹]/g, "INR ")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "?")
    .trim();
}

function formatCurrency(value: number): string {
  return `INR ${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function formatInvoiceDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export async function generateOrderInvoice(
  invoice: OrderInvoiceData,
): Promise<{ blob: Blob; fileName: string }> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ format: "a4", unit: "mm" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 18;
  const right = pageWidth - margin;
  const green = [24, 55, 39] as const;
  const muted = [91, 105, 96] as const;
  const paleGreen = [237, 244, 238] as const;
  const dateKey = [
    invoice.invoiceDate.getFullYear(),
    String(invoice.invoiceDate.getMonth() + 1).padStart(2, "0"),
    String(invoice.invoiceDate.getDate()).padStart(2, "0"),
  ].join("");
  const invoiceNumber = `GL-${printable(invoice.bookingId).replace(/[^A-Za-z0-9-]/g, "-")}-${dateKey}`;
  const total =
    invoice.unitPricePerT === undefined
      ? undefined
      : invoice.quantityT * invoice.unitPricePerT;
  let y = 18;

  pdf.setFillColor(245, 158, 11);
  pdf.rect(0, 0, pageWidth, 6, "F");
  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text("DEMO RECEIPT — NO REAL MONEY CHARGED · SIMULATED TRANSACTION", pageWidth / 2, 4.5, { align: "center" });

  pdf.setFillColor(...green);
  pdf.rect(0, 6, pageWidth, 38, "F");
  pdf.setFillColor(82, 150, 117);
  pdf.circle(margin + 4, 23, 4, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("GREENLOOP", margin + 12, 22);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("MATERIALS RECOVERY NETWORK", margin + 12, 28);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("DEMO RECEIPT", right, 22, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(invoiceNumber, right, 30, { align: "right" });

  y = 54;
  pdf.setTextColor(...green);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("SUMMARY DATE", margin, y);
  pdf.text("ORDER DATE", margin + 58, y);
  pdf.text("TRANSACTION ID", margin + 116, y);
  pdf.setTextColor(35, 43, 37);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(formatInvoiceDate(invoice.invoiceDate), margin, y + 7);
  pdf.text(printable(invoice.orderDate || "Not recorded"), margin + 58, y + 7);
  pdf.text(printable(invoice.bookingId), margin + 116, y + 7, {
    maxWidth: 58,
  });
  y += 23;

  const drawParty = (
    title: string,
    party: InvoiceParty,
    x: number,
    width: number,
  ) => {
    pdf.setFillColor(...paleGreen);
    pdf.roundedRect(x, y, width, 9, 1.5, 1.5, "F");
    pdf.setTextColor(...green);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(title, x + 3, y + 6);
    let textY = y + 16;
    pdf.setTextColor(35, 43, 37);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    const name = printable(party.organization || party.name || "Not recorded");
    const nameLines = pdf.splitTextToSize(name, width - 6) as string[];
    pdf.text(nameLines, x + 3, textY);
    textY += nameLines.length * 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    for (const value of [
      party.name && party.organization ? party.name : undefined,
      party.address,
      party.email,
      party.phone,
    ].filter((item): item is string => Boolean(item))) {
      const lines = pdf.splitTextToSize(printable(value), width - 6) as string[];
      pdf.text(lines, x + 3, textY);
      textY += lines.length * 4.5;
    }
    return textY;
  };

  const gap = 8;
  const partyWidth = (pageWidth - margin * 2 - gap) / 2;
  const providerBottom = drawParty(
    "PROVIDER",
    invoice.provider,
    margin,
    partyWidth,
  );
  const receiverBottom = drawParty(
    "RECEIVER",
    invoice.receiver,
    margin + partyWidth + gap,
    partyWidth,
  );
  y = Math.max(providerBottom, receiverBottom) + 8;

  pdf.setTextColor(...green);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("ORDER DETAILS", margin, y);
  y += 6;
  pdf.setDrawColor(218, 226, 219);
  pdf.line(margin, y, right, y);
  y += 6;
  pdf.setTextColor(...muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  const details = [
    ["Project", invoice.projectName],
    ["Project location", invoice.projectLocation],
    ["Material reference", invoice.materialId],
    ["Load reference", invoice.loadReference],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  for (const [label, value] of details) {
    pdf.setFont("helvetica", "bold");
    pdf.text(`${label}:`, margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(printable(value), margin + 35, y, { maxWidth: right - margin - 35 });
    y += 5;
  }
  y += 5;

  const columns = {
    description: margin + 3,
    quantity: 122,
    rate: 155,
    amount: right - 3,
  };
  pdf.setFillColor(...green);
  pdf.roundedRect(margin, y, right - margin, 10, 1.5, 1.5, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("DESCRIPTION", columns.description, y + 6.5);
  pdf.text("QUANTITY", columns.quantity, y + 6.5, { align: "right" });
  pdf.text("RATE / TONNE", columns.rate, y + 6.5, { align: "right" });
  pdf.text("AMOUNT", columns.amount, y + 6.5, { align: "right" });
  y += 17;

  pdf.setTextColor(35, 43, 37);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text(printable(invoice.materialType), columns.description, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...muted);
  pdf.text(`Material ID: ${printable(invoice.materialId)}`, columns.description, y + 5);
  pdf.setTextColor(35, 43, 37);
  pdf.setFontSize(9);
  pdf.text(`${invoice.quantityT.toLocaleString("en-IN")} t`, columns.quantity, y, {
    align: "right",
  });
  pdf.text(
    invoice.unitPricePerT === undefined
      ? "Not recorded"
      : formatCurrency(invoice.unitPricePerT),
    columns.rate,
    y,
    { align: "right" },
  );
  pdf.text(total === undefined ? "Not available" : formatCurrency(total), columns.amount, y, {
    align: "right",
  });
  y += 13;
  pdf.setDrawColor(218, 226, 219);
  pdf.line(margin, y, right, y);
  y += 9;

  const totalLabelX = right - 80;
  const totalValueX = right;
  pdf.setTextColor(...muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Subtotal", totalLabelX, y);
  pdf.setTextColor(35, 43, 37);
  pdf.text(total === undefined ? "Not available" : formatCurrency(total), totalValueX, y, {
    align: "right",
  });
  y += 6;
  pdf.setTextColor(...muted);
  y += 2;
  pdf.setTextColor(...green);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("ORDER VALUE", totalLabelX, y);
  pdf.text(total === undefined ? "Not available" : formatCurrency(total), totalValueX, y, {
    align: "right",
  });

  y += 12;
  if (invoice.payment) {
    pdf.setTextColor(...green);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("DEMO SETTLEMENT & ESCROW SUMMARY", margin, y);
    y += 7;
    pdf.setTextColor(...muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    const payment = invoice.payment;
    const paymentRows: [string, string][] = [
      ["Escrow status", `${payment.paymentStatus.toUpperCase()} (Simulated Demo)`],
      ["Transaction reference", printable(payment.providerReference)],
      ["Simulated escrow deposit", formatCurrency(payment.amountMinor / 100)],
      ...(payment.paidAt ? [["Deposit timestamp", printable(payment.paidAt)] as [string, string]] : []),
      ...(payment.acceptedT !== undefined ? [["Weighbridge accepted tonnage", `${payment.acceptedT} t`] as [string, string]] : []),
      ...(payment.acceptedT !== undefined ? [["Accepted material value", formatCurrency(payment.acceptedValueMinor / 100)] as [string, string]] : []),
      ...(payment.acceptedT !== undefined ? [["GreenLoop platform commission (5%)", formatCurrency(payment.commissionMinor / 100)] as [string, string]] : []),
      ...(payment.providerFeeMinor > 0 ? [["Provider processing fee", formatCurrency(payment.providerFeeMinor / 100)] as [string, string]] : []),
      ...(payment.payoutAmountMinor > 0 ? [["Provider net payout", `${formatCurrency(payment.payoutAmountMinor / 100)} (${payment.payoutStatus}${payment.payoutReference ? ` · Ref: ${payment.payoutReference}` : ""})`] as [string, string]] : []),
      ...(payment.refundAmountMinor > 0 ? [["Buyer partial-delivery refund", `${formatCurrency(payment.refundAmountMinor / 100)} (${payment.refundStatus})`] as [string, string]] : []),
      ...(payment.disputedAt ? [["Dispute record", `DISPUTED (${printable(payment.disputeReason || "Delivery disputed")})`] as [string, string]] : []),
    ];
    for (const [label, value] of paymentRows) {
      pdf.text(label, margin, y);
      pdf.text(printable(value), right, y, { align: "right" });
      y += 4.5;
    }
  }

  pdf.setFillColor(254, 243, 199);
  pdf.roundedRect(margin, 246, right - margin, 26, 1.5, 1.5, "F");
  pdf.setTextColor(180, 83, 9);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("DEMO RECEIPT — NO REAL MONEY CHARGED", margin + 4, 252);
  pdf.setTextColor(...muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  const note =
    "This document was generated on the GreenLoop Materials Recovery Network demo environment. No banking APIs were called and no real monetary transactions or escrows occurred. This summary is for testing and demonstration workflows only. Tax calculations are not included.";
  pdf.text(pdf.splitTextToSize(note, right - margin - 8), margin + 4, 257);
  pdf.setDrawColor(218, 226, 219);
  pdf.line(margin, 281, right, 281);
  pdf.setFontSize(7);
  pdf.text("GreenLoop - Materials Recovery Network", margin, 287);
  pdf.text(`Order reference: ${printable(invoice.bookingId)}`, right, 287, {
    align: "right",
  });

  const fileName = `GreenLoop-order-summary-${printable(invoice.bookingId).replace(
    /[^A-Za-z0-9-]/g,
    "-",
  )}.pdf`;
  return { blob: pdf.output("blob"), fileName };
}
