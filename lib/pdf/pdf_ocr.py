import sys
from pathlib import Path
import fitz # type: ignore
import pytesseract # type: ignore

# Tesseract is installed but not in PATH
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

from PIL import Image # type: ignore
import io

def main() -> int:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: pdf_ocr.py <input-pdf> <output-pdf> [lanugage1,language2]")

    input_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    
    languages = "eng"
    if len(sys.argv) >= 4:
        # e.g., "eng,fra"
        languages = sys.argv[3].replace(",", "+")
        
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        # Open the source PDF
        src_doc = fitz.open(str(input_path))
        out_doc = fitz.open()

        for page_num in range(len(src_doc)):
            page = src_doc.load_page(page_num)
            
            # Get an image of the page
            pix = page.get_pixmap(matrix=fitz.Matrix(3, 3))
            
            # Convert pixmap to bytes, then to PIL Image
            img_bytes = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_bytes))
            
            try:
                # Get PDF bytes directly from tesseract
                pdf_bytes = pytesseract.image_to_pdf_or_hocr(
                    img, 
                    extension='pdf', 
                    lang=languages
                )
                
                # Append to output document
                temp_pdf = fitz.open("pdf", pdf_bytes)
                out_doc.insert_pdf(temp_pdf)
                temp_pdf.close()
            except Exception as e:
                print(f"Warning: OCR failed on page {page_num + 1}: {e}", file=sys.stderr)
                # Fallback: Just insert the original image as a PDF page
                # This could be more complex, but keeping it simple for now
                out_doc.insert_pdf(src_doc, from_page=page_num, to_page=page_num)
        
        # Save the OCRed PDF
        out_doc.save(str(output_path), garbage=4, deflate=True)
        out_doc.close()
        src_doc.close()
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    return 0

if __name__ == "__main__":
    sys.exit(main())
