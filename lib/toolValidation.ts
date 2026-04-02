const isValidRangeSection = (section: string) => {
  return /^([1-9]\d*)(?:-([1-9]\d*))?$/.test(section.trim());
}

const validateRangesString = (rangesStr: string | undefined): string | null => {
  if (!rangesStr) return "Please specify at least one page range"
  
  const sections = rangesStr.split(",")
  const filledSections = sections.filter(s => s.trim().length > 0)
  if (filledSections.length === 0) return "Please specify at least one page range"

  for (const section of filledSections) {
    if (!isValidRangeSection(section)) {
      return `Invalid format in "${section}". Please use a single number (e.g. 5) or range (e.g. 1-3).`
    }
  }
  return null
}

export function validateToolOptions(toolSlug: string, options: Record<string, unknown>, files: File[]): string | null {
  if (!files || files.length === 0) return "Please select at least one file to process."

  switch (toolSlug) {
    case 'split-pdf':
    case 'remove-pages': {
      const mode = toolSlug === "remove-pages" ? "remove_pages" : ((options.split_mode as string) || "ranges")
      if (mode === "ranges") {
        return validateRangesString(options.ranges as string | undefined)
      }
      if (mode === "fixed_range" && (!options.fixed_range || Number(options.fixed_range) < 1)) {
        return "Please enter a valid positive number for pages per split"
      }
      if (mode === "remove_pages") {
        return validateRangesString(options.remove_pages as string | undefined)
      }
      break
    }
    case 'protect-pdf': {
      if (!options.password) {
        return "Please enter a password to protect the PDF"
      }
      break
    }
    case 'watermark-pdf': {
      const mode = (options.mode as string) || "text"
      if (mode === "text" && !options.text) {
        return "Please enter the watermark text"
      }
      break
    }
    case 'add-page-numbers': {
      // Basic fallback since it has defaults, but verify nothing is obviously broken
      break
    }
    default:
      break
  }

  return null
}
