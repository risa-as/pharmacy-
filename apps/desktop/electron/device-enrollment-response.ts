/** Never display HTML/proxy bodies or accept a malformed enrollment as success. */
export async function readDeviceEnrollmentResponse(response: Response, apiBase: string, fingerprint: string) {
  const server = new URL(apiBase).origin;
  if (response.redirected) throw new Error(`تم تحويل طلب تسجيل الجهاز إلى صفحة أخرى. تحقق من عنوان الخادم والجلسة: ${server}`);
  const data: unknown = await response.json().catch(() => null);
  const record = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown> : null;
  if (!record) {
    if (response.status === 404 || response.status === 405) {
      throw new Error(`خدمة تسجيل مفتاح الجهاز غير متاحة على ${server}. يلزم تجهيز تحديث الخادم وترحيل حماية الجهاز وتفعيل الميزة قبل التسجيل. وضع المطور لا يغيّر خادم الاتصال تلقائيًا.`);
    }
    throw new Error(`أعاد الخادم استجابة غير متوقعة بدل بيانات تسجيل الجهاز (HTTP ${response.status}): ${server}. تحقق من توفر الخدمة ثم أعد المحاولة.`);
  }
  if (!response.ok) throw new Error(typeof record.error === 'string' ? record.error : `تعذر تسجيل الجهاز (HTTP ${response.status}) على ${server}.`);
  if (typeof record.keyId !== 'string' || !record.keyId.trim() || record.fingerprint !== fingerprint ||
      !['PENDING', 'ACTIVE', 'REVOKED'].includes(String(record.status))) {
    throw new Error(`استجابة تسجيل الجهاز غير مكتملة أو لا تطابق بصمته: ${server}. لم يُعتمد التسجيل محليًا؛ أعد التحقق من الحالة.`);
  }
  return {keyId: record.keyId, fingerprint, status: record.status as 'PENDING' | 'ACTIVE' | 'REVOKED'};
}
