/**
 * Maps frontend page number options to iLoveAPI compatible parameters
 */

// iLoveAPI supported font families
const SUPPORTED_FONTS = [
  "Arial",
  "Arial Unicode MS",
  "Verdana",
  "Courier",
  "Times New Roman",
  "Comic Sans MS"
] as const

export interface PageNumberMappedOptions {
  facing_pages?: boolean
  first_cover?: boolean
  pages: string
  starting_number?: number
  vertical_position: string
  horizontal_position: string
  vertical_position_adjustment?: number
  horizontal_position_adjustment?: number
  font_family?: string
  font_size?: number
  font_color?: string
  font_style?: string | null
  text: string
}

export function mapPageNumberOptions(options: Record<string, unknown>): PageNumberMappedOptions {
  // Get the text template - iLoveAPI expects 'text' parameter, not text_format or custom_text
  let text = "{n}"
  if (options.custom_text && typeof options.custom_text === "string" && options.custom_text.trim() !== "") {
    text = options.custom_text
  } else if (options.text_format && typeof options.text_format === "string" && options.text_format !== "custom") {
    text = options.text_format
  }

  const mapped: PageNumberMappedOptions = {
    pages: (options.pages as string) || "all",
    starting_number: (options.starting_number as number) || 1,
    vertical_position: options.vertical_position as string || "bottom",
    horizontal_position: options.horizontal_position as string || "center",
    text: text,
  }

  // Add facing pages options if present
  if (options.page_mode === "facing") {
    mapped.facing_pages = true
    if (options.first_cover) {
      mapped.first_cover = true
    }
  }

  // Add position adjustments if present
  if (options.vertical_position_adjustment) {
    mapped.vertical_position_adjustment = options.vertical_position_adjustment as number
  }
  if (options.horizontal_position_adjustment) {
    mapped.horizontal_position_adjustment = options.horizontal_position_adjustment as number
  }

  // Handle font styling - iLoveAPI expects font_style to be a single value
  // Accepted values: null (Regular), Bold, Italic, Bold italic
  const isBold = options.font_weight === "bold"
  const isItalic = options.font_style === "italic"
  // Note: iLoveAPI doesn't support text decoration (underline) for page numbers like it does for editpdf,
  // so we ignore text_decoration as it's not supported by the pagenumber tool

  if (isBold && isItalic) {
    mapped.font_style = "Bold italic"
  } else if (isBold) {
    mapped.font_style = "Bold"
  } else if (isItalic) {
    mapped.font_style = "Italic"
  } else {
    mapped.font_style = null
  }

  if (options.font_family) {
    const fontFamily = options.font_family as string
    if (SUPPORTED_FONTS.includes(fontFamily as typeof SUPPORTED_FONTS[number])) {
      mapped.font_family = fontFamily
    } else {
      console.warn(`Unsupported font family: ${fontFamily}. Using default: Arial Unicode MS`)
      mapped.font_family = "Arial Unicode MS"
    }
  }

  if (options.font_size) {
    mapped.font_size = options.font_size as number
  }

  if (options.font_color) {
    mapped.font_color = options.font_color as string
  }

  return mapped
}
