export class ILoveAPIError extends Error {
  type: string
  code?: number
  param?: string

  constructor(data: {
    type?: string
    message?: string
    code?: number
    param?: string
  }) {
    super(data.message ?? "iLoveAPI Error")
    this.name = "ILoveAPIError"
    this.type = data.type ?? "UnknownError"
    this.code = data.code
    this.param = data.param
  }
}

export function mapILoveAPIError(error: ILoveAPIError): {
  userMessage: string
  retryable: boolean
} {
  const map: Record<string, { userMessage: string; retryable: boolean }> = {
    WrongPassword: {
      userMessage:
        "This PDF is password-protected. Please provide the correct password.",
      retryable: false,
    },
    DamagedFile: {
      userMessage:
        "This file appears to be corrupted. Try the Repair PDF tool first.",
      retryable: false,
    },
    OutOfRange: {
      userMessage:
        "The page range you specified exceeds the document's page count.",
      retryable: false,
    },
    TimeOut: {
      userMessage: "Processing timed out. Please try with a smaller file.",
      retryable: true,
    },
    NonConformant: {
      userMessage:
        "This PDF does not meet the required PDF/A standard.",
      retryable: false,
    },
    ILOVEAPI_OUT_OF_CREDITS: {
      userMessage: "Processing credits exhausted. Please upgrade your plan.",
      retryable: false,
    },
  }

  return (
    map[error.type] ?? {
      userMessage: "An unexpected error occurred. Please try again.",
      retryable: true,
    }
  )
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxRetries - 1) throw err
      const mapped = mapILoveAPIError(err as ILoveAPIError)
      if (!mapped.retryable) throw err
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)))
    }
  }
  throw new Error("Max retries exceeded")
}
