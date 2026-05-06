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
  "Comic Sans MS",
  "WenQuanYi Zen Hei",
  "Lohit Marathi"
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
  // Priority: Bold > Italic > null (regular)
  if (options.font_weight === "bold") {
    mapped.font_style = "Bold"
  } else if (options.font_style === "italic") {
    mapped.font_style = "Italic"
  } else {
    // Default to null (regular) if no styling
    mapped.font_style = null
  }
  
  // Note: iLoveAPI doesn't support underline decoration
  if (options.font_decoration === "underline") {
    console.warn("iLoveAPI watermark doesn't support underline decoration. Style will be applied without underline.")
  }

  // Map other font properties
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

  // Handle image mode
  if (options.mode === "image" && options.image) {
    mapped.image = options.image
  }

  // Handle layer - iLoveAPI doesn't have a direct layer parameter
  // "above" is the default behavior, "below" might not be supported
  if (options.layer === "below") {
    // Note: iLoveAPI watermark doesn't support "below" layer
    // This would need to be handled differently or documented as a limitation
    console.warn("iLoveAPI watermark doesn't support 'below' layer. Using default 'above'.")
  }

  return mapped
}