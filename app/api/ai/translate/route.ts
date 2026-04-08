import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { runTool } from "@/lib/iloveapi/tools"

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const fileRaw = formData.get("file")
    if (!fileRaw || typeof fileRaw === "string" || !("arrayBuffer" in fileRaw)) {
      return NextResponse.json({ error: "No valid file provided" }, { status: 400 })
    }
    const file = fileRaw as File
    const targetLanguage = (formData.get("language") as string) || "Spanish"

    // Step 1: Extract text via iLoveAPI (detailed mode for positions)
    const buffer = Buffer.from(await file.arrayBuffer())
    const extractResult = await runTool({
      tool: "extract",
      files: [{ buffer, filename: file.name }],
      options: { detailed: true },
    })

    const extractedText = Buffer.from(extractResult.buffer as ArrayBuffer).toString("utf-8")

    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from this PDF." },
        { status: 400 }
      )
    }

    // Step 2: Translate with AI
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "Translation requires OPENAI_API_KEY to be configured." },
        { status: 400 }
      )
    }

    const { default: OpenAI } = await import("openai")
    const openai = new OpenAI({ apiKey })

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert translator. Translate the following text to ${targetLanguage}. Preserve any formatting, section headers, and paragraph structure.`,
        },
        {
          role: "user",
          content: extractedText.slice(0, 50000),
        },
      ],
    })

    const translatedText = completion.choices[0]?.message?.content || ""

    return NextResponse.json({
      translatedText,
      sourceLength: extractedText.length,
      targetLanguage,
    })
  } catch (err) {
    console.error("AI Translate error:", err)
    return NextResponse.json({ error: "Translation failed" }, { status: 500 })
  }
}
