import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { ilovepdf } from "@/lib/iloveapi/client"
import { createSignatureRequest } from "@/lib/iloveapi/signature"
import ILovePDFFile from "@ilovepdf/ilovepdf-nodejs/ILovePDFFile"

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let task: any = null;

  try {
    let formData: FormData
    try {
      const bodyBuffer = await req.arrayBuffer()
      const newReq = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: bodyBuffer
      })
      formData = await newReq.formData()
    } catch (err) {
      console.error("FormData parse error (often due to cancelled XHR or broken upload):", err)
      return NextResponse.json({ error: "Failed to parse file upload request" }, { status: 400 })
    }

    const fileRaw = formData.get("file")
    if (!fileRaw || typeof fileRaw === "string" || !("arrayBuffer" in fileRaw)) {
      return NextResponse.json({ error: "No valid file provided" }, { status: 400 })
    }
    const file = fileRaw as File
    const signersRaw = formData.get("signers") as string
    const optionsRaw = formData.get("options") as string

    const signers = JSON.parse(signersRaw || "[]")
    const options = JSON.parse(optionsRaw || "{}")

    // Start sign task + upload using SDK
    task = ilovepdf.newTask("sign")
    await task.start()
    
    const buffer = await file.arrayBuffer()
    const iloveapiFile = ILovePDFFile.fromArray(Buffer.from(buffer), file.name)
    const addedFile = await task.addFile(iloveapiFile)

    // Create signature request with raw fetch using SDK's assigned server
    const signatureData = await createSignatureRequest({
      task: task.id,
      files: [{ server_filename: (addedFile as { serverFilename: string }).serverFilename, filename: file.name }],
      signers,
      uuid_visible: true,
      verify_enabled: true,
      ...options,
    }, task.server)

    return NextResponse.json({
      tokenRequester: signatureData.token_requester,
      uuid: signatureData.uuid,
      status: signatureData.status,
    })
  } catch (err) {
    console.error("Signature error:", err)
    if (task) {
      try { await task.delete(); } catch { /* ignore */ }
    }
    return NextResponse.json({ error: "Failed to create signature request" }, { status: 500 })
  }
}

