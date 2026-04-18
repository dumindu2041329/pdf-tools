import {
  PDFServices,
  ServicePrincipalCredentials,
  ExportPDFJob,
  ExportPDFParams,
  ExportPDFTargetFormat,
  ExportPDFResult,
  StreamAsset,
} from "@adobe/pdfservices-node-sdk"
import { Readable } from "stream"
import { getSafeBaseName } from "./office-converter"

const PDF_SERVICES_CLIENT_ID = process.env.PDF_SERVICES_CLIENT_ID ?? ""
const PDF_SERVICES_CLIENT_SECRET = process.env.PDF_SERVICES_CLIENT_SECRET ?? ""

const globalForPDFServices = global as unknown as { pdfServices: PDFServices }

function getPDFServices(): PDFServices {
  if (!globalForPDFServices.pdfServices) {
    const credentials = new ServicePrincipalCredentials({
      clientId: PDF_SERVICES_CLIENT_ID,
      clientSecret: PDF_SERVICES_CLIENT_SECRET,
    })
    globalForPDFServices.pdfServices = new PDFServices({ credentials })
  }
  return globalForPDFServices.pdfServices
}

export async function convertPdfToExcelAdobe(
  pdfBuffer: Buffer,
  sourceFilename: string
): Promise<{ buffer: Uint8Array; filename: string }> {
  const pdfServices = getPDFServices()
  const inputAsset = await pdfServices.upload({
    readStream: Readable.from(Buffer.from(pdfBuffer)),
    mimeType: "application/pdf",
  })

  const exportParams = new ExportPDFParams({
    targetFormat: ExportPDFTargetFormat.XLSX,
  })

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

  const outputFilename = `${getSafeBaseName(sourceFilename)}.xlsx`
  const chunks: Uint8Array[] = []

  for await (const chunk of streamAsset.readStream) {
    chunks.push(chunk as Uint8Array)
  }

  const buffer = Buffer.concat(chunks)
  return { buffer: new Uint8Array(buffer), filename: outputFilename }
}