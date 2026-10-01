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
  Keyboard,
  UserRound,
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
  searchInputRef: RefObject<HTMLInputElement | null>;
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
  // One quiet style for the header actions; colour is kept for state (shift, selected).
  const actionButton =
    "h-9 shrink-0 flex items-center gap-1.5 px-2.5 rounded-lg border border-border bg-background text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";
  return (
    <div className="flex w-[68%] flex-col border-l border-border/50 bg-muted/20 print:hidden relative">
      {/* شريط الحالة: الاتصال والمستخدم والوقت فقط. قائمة الاختصارات الكاملة في F1
          (كانت 11 اختصاراً هنا تزدحم وتُقص على الشاشات الصغيرة). */}
      <div className="bg-zinc-900 text-white h-8 flex items-center justify-between px-4 text-xs font-medium shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex items-center gap-1.5 ${isOnline ? "text-success" : "text-warning"}`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? "متصل" : "غير متصل"}</span>
          </div>
          <div className="w-px h-3.5 bg-zinc-700" />
          <span className="text-zinc-400 truncate">مرحباً، {user.name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1.5 text-zinc-400" title="اضغط F1 لعرض كل الاختصارات">
            <Keyboard className="w-3.5 h-3.5" />
            <span>الاختصارات</span>
            <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] text-zinc-300">F1</kbd>
          </span>
          <div className="w-px h-3.5 bg-zinc-700" />
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono tabular-nums">
              {currentTime.toLocaleTimeString("ar-IQ-u-nu-latn", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      </div>

      {/* الهيدر: العنوان والوردية، ثم أزرار بأسلوب واحد، ثم العميل والمزامنة.
          اللون للحالة فقط (الوردية)؛ الاختصار في تلميح الزر. */}
      <div className="bg-card/90 backdrop-blur-md px-3 py-2 flex items-center gap-2 shadow-sm border-b border-border z-10">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center shadow-sm shadow-primary/20">
            <LayoutGrid className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight hidden lg:block">
            <h1 className="text-sm font-black text-foreground">نقطة البيع</h1>
            <p className="text-muted-foreground text-[10px] tabular-nums">
              {products.length} منتج • {cart.reduce((a, c) => a + c.quantity, 0)} في السلة
            </p>
          </div>
        </div>

        <button
          onClick={onToggleShift}
          title={isShiftOpen ? `إنهاء الوردية${shiftSafeName ? ` • الصندوق: ${shiftSafeName}` : ""}` : "بدء الوردية"}
          className={`shrink-0 flex items-center gap-2 h-9 px-3 rounded-[10px] text-xs font-bold border transition-colors ${
            isShiftOpen
              ? "bg-success/10 text-success border-success/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
              : "bg-muted text-muted-foreground border-border hover:bg-success/10 hover:text-success hover:border-success/30"
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isShiftOpen ? "bg-success animate-pulse" : "bg-muted-foreground/50"}`} />
          {isShiftOpen ? (
            <>
              <span className="font-mono tabular-nums">{shiftDuration}</span>
              <span className="font-medium opacity-80 hidden xl:inline">إنهاء</span>
            </>
          ) : (
            <span>بدء الوردية</span>
          )}
        </button>

        <div className="w-px h-6 bg-border shrink-0" />

        <div className="flex items-center gap-1 shrink-0">
          {isShiftOpen && (
            <button onClick={onOpenCashDrop} className={actionButton} title="سحب أو إيداع نقدي في درج الصندوق" aria-label="سحب أو إيداع نقدي">
              <Banknote className="w-4 h-4" />
              <span className="hidden xl:inline">سحب/إيداع</span>
            </button>
          )}
          <button onClick={onOpenReturn} className={actionButton} title="إرجاع بضاعة (F9)" aria-label="إرجاع بضاعة">
            <Undo2 className="w-4 h-4" />
            <span className="hidden xl:inline">إرجاع</span>
          </button>
          <button onClick={onOpenHeld} className={`relative ${actionButton}`} title="الفواتير المعلّقة (F11)" aria-label="الفواتير المعلّقة">
            <PauseCircle className="w-4 h-4" />
            <span className="hidden xl:inline">معلّقة</span>
            {heldCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 bg-primary text-primary-foreground text-[10px] font-black rounded-full flex items-center justify-center tabular-nums">
                {heldCount}
              </span>
            )}
          </button>
          <button
            onClick={onToggleGrid}
            title={showGrid ? "إخفاء كروت المنتجات" : "إظهار كروت المنتجات"}
            aria-pressed={showGrid}
            className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border transition-colors ${
              showGrid
                ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15"
                : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
            }`}
          >
            {showGrid ? <LayoutList className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex items-center gap-1 mr-auto relative z-50 shrink-0">
          <SyncHealthDashboard />
          <div
            className={`flex items-center h-9 rounded-lg border text-xs font-bold transition-colors ${
              selectedPatient
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
            }`}
          >
            <button onClick={onOpenPatient} className="flex items-center gap-1.5 h-full px-2.5 max-w-[8rem] xl:max-w-[11rem]" title={selectedPatient ? "تغيير العميل" : "تحديد عميل"}>
              <UserRound className="w-4 h-4 shrink-0" />
              <span className="flex flex-col items-start leading-tight min-w-0">
                <span className="truncate max-w-[5rem] xl:max-w-[8rem]">{selectedPatient ? selectedPatient.name : "تحديد عميل"}</span>
                {selectedPatient?.loyaltyAccount && (
                  <span className="text-[9px] font-medium opacity-80 tabular-nums">
                    {selectedPatient.loyaltyAccount.totalPoints} نقطة
                  </span>
                )}
              </span>
            </button>
            {selectedPatient && (
              <button
                onClick={onClearPatient}
                className="h-full px-1.5 border-r border-primary/20 hover:bg-primary/10 rounded-l-lg"
                title="إزالة العميل"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={onSync}
            className="h-9 w-9 flex items-center justify-center bg-background border border-border hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            title="مزامنة"
          >
            <Database className="w-4 h-4" />
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
              // Unavailable cards stay readable on the grid background: a visible
              // card with a dashed border and a clear reason, not a faded-out block.
              const unavailable = product.stock <= 0 || isExpired;

              return (
                <button
                  key={product.id}
                  onClick={() => onAddToCart(product)}
                  disabled={unavailable}
                  title={unavailable ? (isExpired ? "منتهي الصلاحية — لا يمكن بيعه" : "نفد من المخزون") : undefined}
                  className={`group relative flex flex-col rounded-2xl p-3 transition-all duration-200 text-right ${
                    unavailable
                      ? "bg-card/80 border border-dashed border-muted-foreground/30 cursor-not-allowed"
                      : "bg-card border border-border hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1 active:scale-[0.97]"
                  }`}
                >
                  {cartItem && (
                    <div className="absolute -top-2.5 -left-2.5 w-7 h-7 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-xs font-black rounded-full flex items-center justify-center shadow-lg shadow-primary/40 z-10 animate-scaleIn ring-2 ring-background">
                      {cartItem.quantity}
                    </div>
                  )}
                  {expiryStatus && !isExpired && (
                    <div
                      className={`absolute top-1.5 right-1.5 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md z-10 ${expiryStatus.color}`}
                    >
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {expiryStatus.label}
                    </div>
                  )}
                  <div
                    className={`mb-2 h-12 w-full rounded-xl flex items-center justify-center text-xl transition-colors ${
                      unavailable
                        ? "bg-muted grayscale opacity-60"
                        : stockLevel === "low"
                          ? "bg-gradient-to-br from-destructive/5 to-warning/5 group-hover:from-destructive/10 group-hover:to-warning/10"
                          : "bg-gradient-to-br from-primary/5 to-primary/10 group-hover:from-primary/10 group-hover:to-primary/15"
                    }`}
                  >
                    💊
                  </div>
                  <h3 className={`line-clamp-1 font-bold text-[13px] leading-snug ${unavailable ? "text-muted-foreground" : "text-foreground"}`}>
                    {product.name}
                  </h3>
                  <div className="flex w-full items-end justify-between mt-auto pt-2">
                    <span className={`font-black text-sm tabular-nums ${unavailable ? "text-muted-foreground" : "text-primary"}`}>
                      {formatIQD(product.price || 0)}
                    </span>
                    {unavailable ? (
                      <span className="shrink-0 whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                        {isExpired ? "منتهي" : "نفد"}
                      </span>
                    ) : (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                          stockLevel === "high"
                            ? "bg-success/10 text-success"
                            : stockLevel === "mid"
                              ? "bg-primary/10 text-primary"
                              : "bg-warning/10 text-warning"
                        }`}
                      >
                        {product.stock}
                      </span>
                    )}
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
