import { getFile } from "@/lib/fileStore";
import { NextResponse } from "next/server";

function encodeRFC5987(value: string): string {
  return encodeURIComponent(value).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const file = getFile(id);

  if (!file) {
    return NextResponse.json({ error: "File not found or expired" }, { status: 404 });
  }

  const { buffer, filename, contentType } = file;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${encodeRFC5987(filename)}"; filename*=UTF-8''${encodeRFC5987(filename)}`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}