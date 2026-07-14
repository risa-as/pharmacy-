import { RefObject } from "react";
import {
  Search,
  Clock,
  Wifi,
  WifiOff,
  LayoutGrid,
  LayoutList,
  Banknote,
  Undo2,
  Database,
  Zap,
  X,
  AlertTriangle,
  PauseCircle,
} from "lucide-react";
import SyncHealthDashboard from "../SyncHealthDashboard";
import { formatIQD, getExpiryStatus } from "./pos-utils";
import type { Product, CartItem, Patient } from "./pos-types";

interface Props {
  products: Product[];
  cart: CartItem[];
  loading: boolean;
  searchTerm: string;
  quickSaleProducts: Product[];
  isOnline: boolean;
  isShiftOpen: boolean;
  shiftDuration: string;
  shiftSafeName: string;
  selectedPatient: Patient | null;
  currentTime: Date;
  user: any;
  searchInputRef: RefObject<HTMLInputElement>;
  onSearchChange: (v: string) => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onAddToCart: (product: Product) => void;
  onToggleShift: () => void;
  onOpenCashDrop: () => void;
  onOpenReturn: () => void;
  onOpenHeld: () => void;
  heldCount: number;
  onOpenPatient: () => void;
  onClearPatient: () => void;
  onSync: () => void;
  onSeed: () => void;
  showGrid: boolean;
  showSearchResults: boolean;
  onToggleGrid: () => void;
}

export default function POSProductGrid({
  products,
  cart,
  loading,
  searchTerm,
  quickSaleProducts,
  isOnline,
  isShiftOpen,
  shiftDuration,
  shiftSafeName,
  selectedPatient,
  currentTime,
  user,
  searchInputRef,
  onSearchChange,
  onSearchKeyDown,
  onAddToCart,
  onToggleShift,
  onOpenCashDrop,
  onOpenReturn,
  onOpenHeld,
  heldCount,
  onOpenPatient,
  onClearPatient,
  onSync,
  onSeed,
  showGrid,
  showSearchResults,
  onToggleGrid,
}: Props) {
  // Show products when: user typed text search (>= 2 chars) OR grid toggle is on
  // NOTE: barcode scan does NOT set showSearchResults so no grid flash
  const showProducts = showSearchResults || showGrid;
  return (
    <div className="flex w-[68%] flex-col border-l border-border/50 bg-muted/20 print:hidden relative">
      {/* شريط الحالة الذكي */}
      <div className="bg-zinc-900 text-white h-9 flex items-center justify-between px-4 text-xs font-medium shrink-0">
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-1.5 ${isOnline ? "text-success" : "text-warning"}`}
          >
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span>{isOnline ? "متصل" : "غير متصل"}</span>
          </div>
          <div className="w-px h-4 bg-zinc-700" />
          <span className="text-zinc-400">مرحباً، {user.name}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-zinc-500">
            {([
              ['F1', 'مساعدة'],
              ['F2', 'بحث'],
              ['F3', 'خصم'],
              ['F4', 'نقدي'],
              ['F5', 'بطاقة'],
              ['F6', 'آجل'],
              ['F7', 'إلغاء'],
              ['F8', 'طباعة'],
              ['F9', 'إرجاع'],
              ['F10', 'تعليق'],
              ['F11', 'معلّقة'],
            ] as [string, string][]).map(([key, label]) => (
              <span key={key} className="flex items-center gap-1">
                <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] tracking-wider text-zinc-300">{key}</span>
                <span className="text-[10px]">{label}</span>
              </span>
            ))}
          </div>
          <div className="w-px h-4 bg-zinc-700" />
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono tabular-nums">
              {currentTime.toLocaleTimeString("ar-IQ-u-nu-latn", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      </div>

      {/* الهيدر */}
      <div className="bg-card/90 backdrop-blur-md px-3 py-2 flex justify-between items-center shadow-sm border-b border-border z-10">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleShift}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-bold transition-all shadow-sm ${
              isShiftOpen
                ? "bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30"
                : "bg-success/10 text-success hover:bg-success/20 border border-success/30"
            }`}
          >
            <Clock className={`w-4 h-4 ${isShiftOpen ? "animate-pulse" : ""}`} />
            <div className="flex flex-col items-start leading-none">
              <span className="text-[10px] opacity-80">
                {isShiftOpen ? "إنهاء الوردية" : "بدء الوردية"}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-xs">
                  {isShiftOpen ? shiftDuration : "--:--:--"}
                </span>
                {isShiftOpen && shiftSafeName && (
                  <span className="text-[9px] bg-destructive/10 px-1 py-0.5 rounded border border-destructive/20">
                    {shiftSafeName}
                  </span>
                )}
              </div>
            </div>
          </button>

          {isShiftOpen && (
            <button
              onClick={onOpenCashDrop}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-warning/10 text-warning hover:bg-warning/20 border border-warning/30 rounded-lg font-bold transition-all shadow-sm"
              title="سحب أو إيداع نقدي في درج الصندوق"
            >
              <Banknote className="w-4 h-4" />
              <span className="text-[10px]">سحب/إيداع</span>
            </button>
          )}

          <button
            onClick={onOpenReturn}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30 rounded-lg font-bold transition-all shadow-sm"
            title="إرجاع بضاعة (F9)"
          >
            <Undo2 className="w-4 h-4" />
            <span className="text-[10px]">إرجاع</span>
            <kbd className="text-[8px] font-mono bg-destructive/10 px-1 py-0.5 rounded border border-destructive/20 opacity-70">
              F9
            </kbd>
          </button>

          <button
            onClick={onOpenHeld}
            className="relative flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 rounded-lg font-bold transition-all shadow-sm"
            title="الفواتير المعلّقة (F11)"
          >
            <PauseCircle className="w-4 h-4" />
            <span className="text-[10px]">معلّقة</span>
            <kbd className="text-[8px] font-mono bg-primary/10 px-1 py-0.5 rounded border border-primary/20 opacity-70">
              F11
            </kbd>
            {heldCount > 0 && (
              <span className="absolute -top-2 -left-2 min-w-5 h-5 px-1 bg-primary text-primary-foreground text-[10px] font-black rounded-full flex items-center justify-center shadow-md ring-2 ring-background">
                {heldCount}
              </span>
            )}
          </button>

          <div className="w-px h-6 bg-border mx-1"></div>
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center shadow-md shadow-primary/20">
            <LayoutGrid className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black text-foreground tracking-tight leading-tight">نقطة البيع</h1>
            <p className="text-muted-foreground text-[10px]">
              {products.length} منتج • {cart.reduce((a, c) => a + c.quantity, 0)} في السلة
            </p>
          </div>
          <button
            onClick={onToggleGrid}
            title={showGrid ? "إخفاء الكروت" : "إظهار الكروت"}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
              showGrid
                ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
                : "bg-muted text-muted-foreground border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30"
            }`}
          >
            {showGrid ? <LayoutList className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
            {showGrid ? "إخفاء الكروت" : "إظهار الكروت"}
          </button>
        </div>
        <div className="flex items-center gap-1.5 relative z-50">
          <SyncHealthDashboard />
          <button
            onClick={onOpenPatient}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              selectedPatient
                ? "bg-primary/10 text-primary border-primary/30 shadow-sm"
                : "bg-background text-muted-foreground border-border hover:bg-muted hover:border-border"
            }`}
          >
            <span className="text-sm">👤</span>
            <div>
              <div className="text-[10px]">
                {selectedPatient ? selectedPatient.name : "تحديد عميل"}
              </div>
              {selectedPatient && (
                <div className="flex items-center gap-1.5 text-[9px] font-normal opacity-80 mt-0.5">
                  <span>{selectedPatient.phone}</span>
                  {selectedPatient.loyaltyAccount && (
                    <span className={`px-1 py-0.5 rounded-full ${
                      selectedPatient.loyaltyAccount.tier === "GOLD"
                        ? "bg-warning/10 text-warning"
                        : selectedPatient.loyaltyAccount.tier === "SILVER"
                          ? "bg-muted text-muted-foreground"
                          : "bg-warning/20 text-warning"
                    }`}>
                      💎 {selectedPatient.loyaltyAccount.totalPoints} نقطة
                    </span>
                  )}
                </div>
              )}
            </div>
            {selectedPatient && (
              <button
                onClick={(e) => { e.stopPropagation(); onClearPatient(); }}
                className="p-0.5 hover:bg-primary/10 rounded-full transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </button>
          <button
            onClick={onSync}
            className="p-1.5 bg-background border border-border hover:bg-primary/10 hover:border-primary/30 rounded-lg transition-all text-muted-foreground hover:text-primary"
            title="مزامنة"
          >
            <Database className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* البحث */}
      <div className="px-5 pt-4 pb-2 relative z-0">
        <div className="relative group">
          <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            autoFocus
            placeholder="ابحث عن دواء بالاسم أو الباركود... (F2 للتركيز • Enter للإضافة)"
            className="w-full rounded-xl border border-border bg-background py-3.5 pr-12 pl-4 text-base shadow-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-muted-foreground"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
          />
          {searchTerm && (
            <button
              onClick={() => {
                onSearchChange("");
                searchInputRef.current?.focus();
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {searchTerm && products.length > 0 && (
        <div className="px-5 pb-1">
          <span className="text-xs text-muted-foreground font-medium">
            {products.length} نتيجة لـ "{searchTerm}"
          </span>
        </div>
      )}

      {/* لوحة البيع السريع */}
      {!searchTerm && quickSaleProducts.length > 0 && (
        <div className="px-5 pb-3 pt-1">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold text-muted-foreground">
              بيع سريع
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickSaleProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => onAddToCart(product)}
                disabled={product.stock <= 0}
                className={`flex flex-col items-start px-3 py-2 rounded-xl border text-right transition-all text-sm font-bold ${
                  product.stock <= 0
                    ? "opacity-40 cursor-not-allowed bg-muted border-border"
                    : "bg-amber-50 border-amber-200 hover:border-amber-400 hover:bg-amber-100 active:scale-95 dark:bg-amber-950/20 dark:border-amber-800"
                }`}
              >
                <span className="text-foreground leading-tight">
                  {product.name}
                </span>
                <span className="text-xs font-normal text-amber-600 dark:text-amber-400">
                  {new Intl.NumberFormat("en-US").format(product.price)} د.ع
                  {product.stock <= 0 && (
                    <span className="text-destructive mr-1">• نفد</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* شبكة المنتجات */}
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {/* حالة إخفاء الكروت مع لا يوجد بحث */}
        {!showProducts && (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground py-20 animate-fadeIn">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4">
              <LayoutGrid className="w-7 h-7 opacity-30" />
            </div>
            <p className="text-sm font-medium">الكروت مخفية</p>
            <p className="text-xs mt-1 opacity-60">
              ابحث عن دواء أو اضغط "إظهار الكروت"
            </p>
          </div>
        )}
        {showProducts && (
          <div className="grid grid-cols-2 gap-3 pt-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {products.map((product) => {
              const cartItem = cart.find((c) => c.id === product.id);
              const expiryStatus = getExpiryStatus(product.nearestExpiry);
              const isExpired = expiryStatus?.label === "منتهي";
              const stockLevel =
                product.stock > 20
                  ? "high"
                  : product.stock > 5
                    ? "mid"
                    : product.stock > 0
                      ? "low"
                      : "out";

              return (
                <button
                  key={product.id}
                  onClick={() => onAddToCart(product)}
                  disabled={product.stock <= 0 || isExpired}
                  className={`group relative flex flex-col rounded-2xl p-3 transition-all duration-200 text-right ${
                    product.stock <= 0 || isExpired
                      ? "bg-muted opacity-50 cursor-not-allowed border border-transparent"
                      : "bg-card border border-border hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1 active:scale-[0.97]"
                  }`}
                >
                  {cartItem && (
                    <div className="absolute -top-2.5 -left-2.5 w-7 h-7 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-xs font-black rounded-full flex items-center justify-center shadow-lg shadow-primary/40 z-10 animate-scaleIn ring-2 ring-background">
                      {cartItem.quantity}
                    </div>
                  )}
                  {expiryStatus && (
                    <div
                      className={`absolute top-1.5 right-1.5 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md z-10 ${expiryStatus.color}`}
                    >
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {expiryStatus.label}
                    </div>
                  )}
                  <div
                    className={`mb-2 h-12 w-full rounded-xl flex items-center justify-center text-xl transition-colors ${
                      stockLevel === "out"
                        ? "bg-muted"
                        : stockLevel === "low"
                          ? "bg-gradient-to-br from-destructive/5 to-warning/5 group-hover:from-destructive/10 group-hover:to-warning/10"
                          : "bg-gradient-to-br from-primary/5 to-primary/10 group-hover:from-primary/10 group-hover:to-primary/15"
                    }`}
                  >
                    💊
                  </div>
                  <h3 className="line-clamp-1 font-bold text-foreground text-[13px] leading-snug">
                    {product.name}
                  </h3>
                  <div className="flex w-full items-end justify-between mt-auto pt-2">
                    <span className="font-black text-primary text-sm tabular-nums">
                      {formatIQD(product.price || 0)}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                        stockLevel === "high"
                          ? "bg-success/10 text-success"
                          : stockLevel === "mid"
                            ? "bg-primary/10 text-primary"
                            : stockLevel === "low"
                              ? "bg-warning/10 text-warning"
                              : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {product.stock > 0 ? product.stock : "نفد"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {showProducts && products.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground py-20 animate-fadeIn">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-5">
              <Search className="h-8 w-8 opacity-25" />
            </div>
            <h3 className="text-lg font-bold text-muted-foreground mb-1">
              لا توجد نتائج
            </h3>
            <p className="text-muted-foreground mb-6 max-w-xs text-center text-sm">
              جرب كلمات مفتاحية أخرى
            </p>
            <button
              onClick={onSeed}
              className="px-5 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl font-bold transition-colors text-sm"
            >
              إعادة تهيئة المنتجات
            </button>
          </div>
        )}

        {loading && (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground py-20">
            <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="font-medium animate-pulse text-sm">
              جاري جلب البيانات...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
