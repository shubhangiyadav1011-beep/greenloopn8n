import type { ReactNode } from "react";

import { cn } from "@/utils";

// Props for Table
interface TableProps {
  children: ReactNode; // Table content (thead, tbody, etc.)
  className?: string; // Optional className for styling
}

// Props for TableHeader
interface TableHeaderProps {
  children: ReactNode; // Header row(s)
  className?: string; // Optional className for styling
}

// Props for TableBody
interface TableBodyProps {
  children: ReactNode; // Body row(s)
  className?: string; // Optional className for styling
}

// Props for TableRow
interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode; // Cells (th or td)
  className?: string; // Optional className for styling
}

// Props for TableCell
interface TableCellProps {
  children?: ReactNode; // Cell content
  isHeader?: boolean; // If true, renders as <th>, otherwise <td>
  className?: string; // Optional className for styling
  /** Render cell text in mono numerals (tonnes, IDs, capacity). */
  mono?: boolean; // GreenLoop ledger numerals
}

// Table Component — GreenLoop ledger base
const Table: React.FC<TableProps> = ({ children, className }) => {
  return <table className={cn("min-w-full text-start", className)}>{children}</table>;
};

// TableHeader Component
const TableHeader: React.FC<TableHeaderProps> = ({ children, className }) => {
  return <thead className={className}>{children}</thead>;
};

// TableBody Component
const TableBody: React.FC<TableBodyProps> = ({ children, className }) => {
  return <tbody className={className}>{children}</tbody>;
};

// TableRow Component
const TableRow: React.FC<TableRowProps> = ({ children, className, ...props }) => {
  return <tr className={className} {...props}>{children}</tr>;
};

// TableCell Component — headers render as mono uppercase labels
const TableCell: React.FC<TableCellProps> = ({
  children,
  isHeader = false,
  className,
  mono = false,
}) => {
  const CellTag = isHeader ? "th" : "td";
  const headerBase = isHeader
    ? "eyebrow-label text-steel-600 dark:text-steel-400"
    : "";
  const monoBase = mono && !isHeader ? "ledger-numeral" : "";
  return <CellTag className={cn(headerBase, monoBase, className)}>{children}</CellTag>;
};

export { Table, TableBody, TableCell, TableHeader, TableRow };
