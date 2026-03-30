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
    const length = (formData.get("length") as string) || "standard"

    // Step 1: Extract text via iLoveAPI
    const buffer = Buffer.from(await file.arrayBuffer())
    const extractResult = await runTool({
      tool: "extract",
      files: [{ buffer, filename: file.name }],
      options: { detailed: false },
    })

    const extractedText = Buffer.from(extractResult.buffer).toString("utf-8")

    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from this PDF. Try using OCR first." },
        { status: 400 }
      )
    }

    // Step 2: Summarize with AI
    // Uses OpenAI if OPENAI_API_KEY is set, otherwise returns extracted text
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      // Fallback: return extracted text directly
      const lengthLabels = { brief: "Brief", standard: "Standard", detailed: "Detailed" }
      return NextResponse.json({
        summary: `[${lengthLabels[length as keyof typeof lengthLabels] || "Standard"} Summary]\n\n${extractedText.slice(0, 3000)}`,
        note: "AI summarization requires OPENAI_API_KEY. Showing extracted text instead.",
      })
    }

    const { default: OpenAI } = await import("openai")
    const openai = new OpenAI({ apiKey })

    const lengthPrompts: Record<string, string> = {
      brief: "Provide 3-5 bullet points of key points only.",
      standard: "Provide a 2-3 paragraph summary.",
      detailed: "Provide a structured summary with: Overview, Key Points, and Conclusions.",
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert document summarizer. ${lengthPrompts[length] || lengthPrompts.standard}`,
        },
        {
          role: "user",
          content: `Summarize the following document:\n\n${extractedText.slice(0, 50000)}`,
        },
      ],
    })

    return NextResponse.json({
      summary: completion.choices[0]?.message?.content || "No summary generated.",
    })
  } catch (err) {
    console.error("AI Summarize error:", err)
    return NextResponse.json({ error: "Summarization failed" }, { status: 500 })
  }
}
