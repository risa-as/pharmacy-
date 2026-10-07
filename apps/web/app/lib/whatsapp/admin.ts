import { auth } from "@/auth";
import { prisma } from "../prisma";
import { WaError } from "./domain";
export async function whatsappAdministrator() {
  const s = await auth();
  if (!s?.user?.id || (s as any).error)
    throw new WaError("سجّل الدخول أولًا.", 401);
  if (s.user.role !== "SUPER_ADMIN")
    throw new WaError("هذا الإجراء متاح لمدير المنصة فقط.", 403);
  const u = await prisma.user.findUnique({
    where: { id: s.user.id },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!u?.isActive || u.role !== "SUPER_ADMIN")
    throw new WaError("هذا الإجراء متاح لمدير المنصة فقط.", 403);
  return u;
}
export async function whatsappOrganization(id: string) {
  if (
    !(await prisma.organization.findUnique({
      where: { id },
      select: { id: true },
    }))
  )
    throw new WaError("المؤسسة غير موجودة.", 404);
  return id;
}
