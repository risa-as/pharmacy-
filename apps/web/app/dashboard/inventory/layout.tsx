/**
 * Inventory Hub Layout
 *
 * Wraps all /dashboard/inventory/** pages with a sticky tab bar so that
 * every inventory sub-tool is reachable without a sidebar entry.
 *
 * Tabs  (8):  Inventory · Stocktakes · Shortages · Expired/Damaged
 *             Transfers · Batches · Product Movement · Margin Warnings
 * Actions (2): Print Barcode · Bulk Pricing
 *
 * The nav is hidden on deep /create and /edit forms (skipOnPatterns).
 */

import HubTabNav, { type HubTab, type HubAction } from "@/app/ui/hub-tab-nav";
import {
  Package,
  CheckSquare,
  AlertTriangle,
  PackageMinus,
  ArrowRightLeft,
  Layers,
  Activity,
  TrendingDown,
  Tag,
  DollarSign,
} from "lucide-react";

const TABS: HubTab[] = [
  {
    name: "المخزون",
    href: "/dashboard/inventory",
    icon: <Package className="w-3.5 h-3.5 shrink-0" />,
  },
  {
    name: "الجرد",
    href: "/dashboard/inventory/stocktakes",
    icon: <CheckSquare className="w-3.5 h-3.5 shrink-0" />,
  },
  {
    name: "النواقص",
    href: "/dashboard/inventory/shortages",
    icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0" />,
  },
  {
    name: "المنتهية والتوالف",
    href: "/dashboard/inventory/expired-damaged",
    icon: <PackageMinus className="w-3.5 h-3.5 shrink-0" />,
  },
  {
    name: "التحويلات",
    href: "/dashboard/inventory/transfers",
    icon: <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />,
  },
  {
    name: "حركة منتج",
    href: "/dashboard/inventory/product-movement",
    icon: <Activity className="w-3.5 h-3.5 shrink-0" />,
  },
  {
    name: "تحذيرات الهامش",
    href: "/dashboard/inventory/margin-warnings",
    icon: <TrendingDown className="w-3.5 h-3.5 shrink-0" />,
  },
];

const ACTIONS: HubAction[] = [
  {
    name: "طباعة الباركود",
    href: "/dashboard/inventory/barcode-print",
    icon: <Tag className="w-3.5 h-3.5 shrink-0" />,
    variant: "outline",
  },
  {
    name: "تعديل الأسعار",
    href: "/dashboard/inventory/bulk-pricing",
    icon: <DollarSign className="w-3.5 h-3.5 shrink-0" />,
    variant: "outline",
  },
];

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <HubTabNav
        tabs={TABS}
        actions={ACTIONS}
        skipOnPatterns={["/create", "/edit"]}
      />
      {children}
    </>
  );
}
