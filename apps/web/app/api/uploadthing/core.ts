import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { NextResponse } from "next/server";
import { getTenantContext } from "@/app/lib/tenant-utils";

const f = createUploadthing();

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter = {
    // Image uploads (drug images, signatures, …).
    imageUploader: f({ image: { maxFileSize: "4MB" } })
        .middleware(async () => {
            // Real authentication — only a signed-in tenant user may upload.
            // (Previously a fake auth let ANYONE upload to our UploadThing account,
            // an open door for abuse and runaway storage cost.)
            const tenantCtx = await getTenantContext();
            if (tenantCtx instanceof NextResponse) {
                throw new UploadThingError("Unauthorized");
            }
            // Returned values are available in onUploadComplete as `metadata`.
            return {
                userId: tenantCtx.user.id,
                organizationId: tenantCtx.organizationId ?? null,
            };
        })
        .onUploadComplete(async ({ metadata, file }) => {
            console.log(
                `[uploadthing] image uploaded by user=${metadata.userId} org=${metadata.organizationId ?? "—"} url=${file.ufsUrl}`,
            );
            return { uploadedBy: metadata.userId };
        }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
