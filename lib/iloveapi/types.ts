export type ILoveAPITool =
  | "compress"
  | "extract"
  | "htmlpdf"
  | "imagepdf"
  | "merge"
  | "officepdf"
  | "pagenumber"
  | "pdfa"
  | "pdfjpg"
  | "pdfocr"
  | "protect"
  | "repair"
  | "rotate"
  | "unlock"
  | "validatepdfa"
  | "watermark"
  | "editpdf"
  | "sign"

export type ILoveAPIRegion = "eu" | "us" | "fr" | "de" | "pl"

export type TaskStatus =
  | "TaskWaiting"
  | "TaskProcessing"
  | "TaskSuccess"
  | "TaskSuccessWithWarnings"
  | "TaskError"
  | "TaskDeleted"
  | "TaskNotFound"

export type FileStatus =
  | "FileSuccess"
  | "FileWaiting"
  | "WrongPassword"
  | "TimeOut"
  | "ServerFileNotFound"
  | "DamagedFile"
  | "NoImages"
  | "OutOfRange"
  | "NonConformant"
  | "UnknownError"

export interface StartResponse {
  server: string
  task: string
  remaining_credits: number
}

export interface UploadResponse {
  server_filename: string
}

export interface ProcessFileEntry {
  server_filename: string
  filename: string
  rotate?: 0 | 90 | 180 | 270
  password?: string
}

export interface ProcessResponse {
  download_filename: string
  filesize: number
  output_filesize: number
  output_filenumber: number
  output_extensions: string[]
  timer: string
  status: "TaskSuccess" | "TaskSuccessWithWarnings" | "TaskError"
}

export interface ConnectTaskResponse {
  task: string
  files: Array<{ server_filename: string; filename: string }>
}
