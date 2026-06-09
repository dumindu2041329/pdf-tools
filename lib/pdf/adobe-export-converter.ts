import {
  PDFServices,
  ServicePrincipalCredentials,
  ExportPDFJob,
  ExportPDFParams,
  ExportPDFTargetFormat,
  ExportPDFResult,
  StreamAsset,
  OCRJob,
  OCRParams,
  OCRResult,
  OCRSupportedLocale,
  OCRSupportedType,
  ClientConfig,
} from "@adobe/pdfservices-node-sdk"
import { Readable } from "stream"
import { getSafeBaseName } from "./office-converter"

const PDF_SERVICES_CLIENT_ID = process.env.PDF_SERVICES_CLIENT_ID ?? ""
const PDF_SERVICES_CLIENT_SECRET = process.env.PDF_SERVICES_CLIENT_SECRET ?? ""

// The SDK's default request timeout is 10 seconds, which is far too short
// for uploading PDFs to the Adobe asset service. Adobe rejects input
// assets over 100 MB, so the largest file we ever upload is ~100 MB.
// 10 minutes is enough for a 100 MB upload at ~1.4 Mbps (a slow but
// realistic broadband speed).
const ADOBE_REQUEST_TIMEOUT_MS = 10 * 60 * 1000

function createPDFServices(): PDFServices {
  const credentials = new ServicePrincipalCredentials({
    clientId: PDF_SERVICES_CLIENT_ID,
    clientSecret: PDF_SERVICES_CLIENT_SECRET,
  })
  return new PDFServices({
    credentials,
    clientConfig: new ClientConfig({ timeout: ADOBE_REQUEST_TIMEOUT_MS }),
  })
}

async function runExportPDF(
  pdfBuffer: Buffer,
  targetFormat: ExportPDFTargetFormat,
  sourceFilename: string
): Promise<{ buffer: Uint8Array; filename: string }> {
  const pdfServices = createPDFServices()
  const inputAsset = await pdfServices.upload({
    readStream: Readable.from(Buffer.from(pdfBuffer)),
    mimeType: "application/pdf",
  })

  const exportParams = new ExportPDFParams({ targetFormat })
  const job = new ExportPDFJob({ inputAsset, params: exportParams })
  const pollingURL = await pdfServices.submit({ job })

  const pdfServicesResponse = await pdfServices.getJobResult({
    pollingURL,
    resultType: ExportPDFResult,
  })

  if (!pdfServicesResponse.result) {
    throw new Error("Adobe ExportPDF job returned no result")
  }

  const resultAsset = pdfServicesResponse.result.asset
  const streamAsset: StreamAsset = await pdfServices.getContent({ asset: resultAsset })

  let ext: string
  if (targetFormat === ExportPDFTargetFormat.DOCX) {
    ext = "docx"
  } else if (targetFormat === ExportPDFTargetFormat.XLSX) {
    ext = "xlsx"
  } else {
    ext = "pptx"
  }
  const outputFilename = `${getSafeBaseName(sourceFilename)}.${ext}`
  const chunks: Uint8Array[] = []

  for await (const chunk of streamAsset.readStream) {
    chunks.push(chunk as Uint8Array)
  }

  const buffer = Buffer.concat(chunks)
  return { buffer: new Uint8Array(buffer), filename: outputFilename }
}

export async function convertPdfToWordAdobe(
  pdfBuffer: Buffer,
  sourceFilename: string
): Promise<{ buffer: Uint8Array; filename: string }> {
  return runExportPDF(pdfBuffer, ExportPDFTargetFormat.DOCX, sourceFilename)
}

export async function convertPdfToExcelAdobe(
  pdfBuffer: Buffer,
  sourceFilename: string
): Promise<{ buffer: Uint8Array; filename: string }> {
  return runExportPDF(pdfBuffer, ExportPDFTargetFormat.XLSX, sourceFilename)
}

export async function convertPdfToPowerpointAdobe(
  pdfBuffer: Buffer,
  sourceFilename: string
): Promise<{ buffer: Uint8Array; filename: string }> {
  return runExportPDF(pdfBuffer, ExportPDFTargetFormat.PPTX, sourceFilename)
}

async function runOCR(
  pdfBuffer: Buffer,
  sourceFilename: string,
  locale?: OCRSupportedLocale
): Promise<{ buffer: Uint8Array; filename: string }> {
  const pdfServices = createPDFServices()
  const inputAsset = await pdfServices.upload({
    readStream: Readable.from(Buffer.from(pdfBuffer)),
    mimeType: "application/pdf",
  })

  let ocrParams: OCRParams | undefined
  if (locale) {
    ocrParams = new OCRParams({
      ocrLocale: locale,
      ocrType: OCRSupportedType.SEARCHABLE_IMAGE_EXACT,
    })
  }

  const job = new OCRJob({ inputAsset, params: ocrParams })
  const pollingURL = await pdfServices.submit({ job })

  const pdfServicesResponse = await pdfServices.getJobResult({
    pollingURL,
    resultType: OCRResult,
  })

  if (!pdfServicesResponse.result) {
    throw new Error("Adobe OCR job returned no result")
  }

  const resultAsset = pdfServicesResponse.result.asset
  const streamAsset: StreamAsset = await pdfServices.getContent({ asset: resultAsset })

  const outputFilename = `${getSafeBaseName(sourceFilename)}-ocr.pdf`
  const chunks: Uint8Array[] = []

  for await (const chunk of streamAsset.readStream) {
    chunks.push(chunk as Uint8Array)
  }

  const buffer = Buffer.concat(chunks)
  return { buffer: new Uint8Array(buffer), filename: outputFilename }
}

export async function ocrPdfAdobe(
  pdfBuffer: Buffer,
  sourceFilename: string,
  locale?: OCRSupportedLocale
): Promise<{ buffer: Uint8Array; filename: string }> {
  return runOCR(pdfBuffer, sourceFilename, locale)
}
