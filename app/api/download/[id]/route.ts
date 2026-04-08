import { getFile } from "@/lib/fileStore";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const file = getFile(id);

  if (!file) {
    return new Response(JSON.stringify({ error: "File not found or expired" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { buffer, filename, contentType } = file;

  // Convert to ArrayBuffer to satisfy BodyInit type
  const responseBody = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;

  return new Response(responseBody, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
