/**
 * Maps frontend watermark options to iLoveAPI compatible parameters
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

export function mapWatermarkOptions(options: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {
    mode: options.mode || "text",
    text: options.text,
    pages: options.pages || "all",
    vertical_position: options.vertical_position || "middle",
    horizontal_position: options.horizontal_position || "center",
    rotation: options.rotation || 0,
  }

  // Handle font styling - iLoveAPI expects font_style to be a single value
  // Accepted values: null (Regular), Bold, Italic
  // Note: Bold Italic combination is NOT supported by iLoveAPI watermark
  const isBold = options.font_weight === "bold"
  const isItalic = options.font_style === "italic"

  if (isBold) {
    mapped.font_style = "Bold"
  } else if (isItalic) {
    mapped.font_style = "Italic"
  } else {
    mapped.font_style = null
  }

  if (options.font_family) {
    // Validate font family is supported
    const fontFamily = options.font_family as string
    if (SUPPORTED_FONTS.includes(fontFamily as typeof SUPPORTED_FONTS[number])) {
      mapped.font_family = fontFamily
    } else {
      console.warn(`Unsupported font family: ${fontFamily}. Using default: Arial Unicode MS`)
      mapped.font_family = "Arial Unicode MS"
    }
  }
  
  if (options.font_size) {
    mapped.font_size = options.font_size
  }
  
  if (options.font_color) {
    mapped.font_color = options.font_color
  }

  // Handle transparency mapping - frontend uses inverted values
  if (options.transparency !== undefined) {
    mapped.transparency = options.transparency
  }

  if (options.mosaic) {
    mapped.mosaic = true
  }

  if (options.layer) {
    mapped.layer = options.layer
  }

  // Handle image mode
  if (options.mode === "image" && options.image) {
    mapped.image = options.image
  }

  return mapped
}