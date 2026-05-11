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

export interface WatermarkMappedOptions {
  mode: string
  text?: string
  pages: string
  vertical_position: string
  horizontal_position: string
  rotation: number
  font_style?: string | null
  font_family?: string
  font_size?: number
  font_color?: string
  transparency: number
  mosaic?: boolean
  layer: string
  image?: string
}

export function mapWatermarkOptions(options: Record<string, unknown>): WatermarkMappedOptions {
  const mode = (options.mode as string) || "text"

  const mapped: WatermarkMappedOptions = {
    mode: mode,
    text: mode === "text" ? (options.text as string | undefined) : undefined,
    pages: (options.pages as string) || "all",
    vertical_position: options.vertical_position as string || "middle",
    horizontal_position: options.horizontal_position as string || "center",
    rotation: (options.rotation as number) || 0,
    transparency: (options.transparency as number) ?? 100,
    layer: options.layer as string || "above",
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

  if (options.mosaic) {
    mapped.mosaic = true
  }

  // Handle image mode - the image should be uploaded separately and server_filename passed
  if (options.mode === "image" && options.imageServerFilename) {
    mapped.image = options.imageServerFilename as string
  }

  // In image mode, do not send text-related params - iLoveAPI will validate text cannot be blank
  if (mapped.mode === "image") {
    delete mapped.text
    delete mapped.font_style
    delete mapped.font_family
    delete mapped.font_size
    delete mapped.font_color
  }

  return mapped
}