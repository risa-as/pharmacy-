/** Never interpret an HTML error/login page as a successful API response. */
export async function operationJson(response: Response) {
  const contentType = response.headers?.get("content-type") || "";
  if (
    (response.status === 404 || response.status === 405) &&
    !contentType.includes("json")
  )
    throw Error(
      "الخادم المتصل به لا يدعم وظائف سطح المكتب الجديدة بعد. يلزم نشر تحديث الويب الذي يتضمن /api/desktop/operations/session ثم إعادة المحاولة.",
    );
  if (response.redirected || (contentType && !contentType.includes("json")))
    throw Error(
      "أعاد الخادم صفحة بدلاً من بيانات API. تحقق من عنوان الخادم وتحديثه؛ لم تُمنح صلاحيات للعملية.",
    );
  try {
    return await response.json();
  } catch {
    throw Error(
      "استجابة الخادم غير صالحة. تحقق من توافق إصدار الخادم مع تطبيق سطح المكتب.",
    );
  }
}
