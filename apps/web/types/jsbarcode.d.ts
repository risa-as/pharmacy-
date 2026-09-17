// المرحلة 4 من ميزة المذاخر (طباعة الباركود والملصقات): تصريح أنواع محلي لحزمة
// jsbarcode المُثبَّتة أصلاً في package.json ("jsbarcode": "^3.12.3") — هذه
// الحزمة تشحن jsbarcode.d.ts في جذرها لكن بلا حقل "types"/"typings" في
// package.json يشير إليه، فلا يجده TypeScript تلقائياً (moduleResolution:
// "bundler" في tsconfig.json). هذا ليس تثبيت تبعية جديدة — القيد #6 في مواصفة
// هذه المرحلة يمنع إضافة تبعية جديدة، لا كتابة تصريح أنواع محلي لتبعية موجودة
// أصلاً. يغطي فقط الاستخدام الفعلي في app/warehouse/labels/LabelsClient.tsx.
declare module "jsbarcode" {
  interface JsBarcodeOptions {
    format?: string;
    width?: number;
    height?: number;
    displayValue?: boolean;
    text?: string;
    fontOptions?: string;
    font?: string;
    textAlign?: string;
    textPosition?: string;
    textMargin?: number;
    fontSize?: number;
    background?: string;
    lineColor?: string;
    margin?: number;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    flat?: boolean;
    /** يُستدعى بـ false بدل رمي استثناء إن كان النص غير صالح للترميز المطلوب. */
    valid?: (isValid: boolean) => void;
  }

  export default function JsBarcode(
    element: SVGElement | HTMLElement | HTMLCanvasElement | string,
    text: string,
    options?: JsBarcodeOptions
  ): void;
}
