export function validateToolOptions(toolSlug: string, options: Record<string, unknown>, files: File[]): string | null {
  if (!files || files.length === 0) return "Please select at least one file to process."

  switch (toolSlug) {
    case 'split-pdf':
    case 'remove-pages': {
      const mode = (options.split_mode as string) || "ranges"
      if (mode === "ranges" && !options.ranges) {
        return "Please specify the page ranges (e.g. 1-3, 5)"
      }
      if (mode === "fixed_range" && (!options.fixed_range || Number(options.fixed_range) < 1)) {
        return "Please enter a valid positive number for pages per split"
      }
      if (mode === "remove_pages" && !options.remove_pages) {
        return "Please specify which pages to remove"
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
