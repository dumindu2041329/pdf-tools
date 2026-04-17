import sys
from pathlib import Path
import io

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

try:
    from openpyxl import Workbook
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False


def extract_tables_from_pdf(pdf_path: str):
    tables_by_page = []
    
    if HAS_PDFPLUMBER:
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                page_tables = []
                tables = page.extract_tables()
                if tables:
                    for table in tables:
                        if table:
                            page_tables.append(table)
                if page_tables:
                    tables_by_page.append((page_num + 1, page_tables))
    
    if not tables_by_page:
        if HAS_PDFPLUMBER:
            with pdfplumber.open(pdf_path) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    text = page.extract_text()
                    if text:
                        lines = [line.strip() for line in text.split('\n') if line.strip()]
                        if lines:
                            table = [line.split() for line in lines]
                            if table:
                                tables_by_page.append((page_num + 1, [table]))
        else:
            raise SystemExit("pdfplumber is required for table extraction. Install with: pip install pdfplumber")
    
    return tables_by_page


def create_excel_single_sheet(tables_by_page: list, output_path: str):
    if not HAS_OPENPYXL:
        raise SystemExit("openpyxl is required for Excel creation. Install with: pip install openpyxl")
    
    wb = Workbook()
    ws = wb.active
    ws.title = "All Tables"
    
    current_row = 1
    
    for page_num, tables in tables_by_page:
        for table_idx, table in enumerate(tables):
            for row in table:
                for col_idx, cell in enumerate(row):
                    cell_value = str(cell) if cell is not None else ""
                    ws.cell(row=current_row, column=col_idx + 1, value=cell_value)
                current_row += 1
            current_row += 1
    
    wb.save(output_path)


def create_excel_multiple_sheets(tables_by_page: list, output_path: str):
    if not HAS_OPENPYXL:
        raise SystemExit("openpyxl is required for Excel creation. Install with: pip install openpyxl")
    
    wb = Workbook()
    wb.remove(wb.active)
    
    for page_num, tables in tables_by_page:
        sheet_name = f"Page {page_num}"
        ws = wb.create_sheet(title=sheet_name)
        
        current_row = 1
        for table_idx, table in enumerate(tables):
            for row in table:
                for col_idx, cell in enumerate(row):
                    cell_value = str(cell) if cell is not None else ""
                    ws.cell(row=current_row, column=col_idx + 1, value=cell_value)
                current_row += 1
            current_row += 1
    
    wb.save(output_path)


def main() -> int:
    if len(sys.argv) < 4:
        raise SystemExit("Usage: pdf_to_xlsx.py <input-pdf> <output-xlsx> <layout>")
    
    input_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    layout = sys.argv[3]
    
    if layout not in ("single", "multiple"):
        raise SystemExit("Layout must be 'single' (One Sheet) or 'multiple' (Multiple Sheets)")
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        tables_by_page = extract_tables_from_pdf(str(input_path))
        
        if layout == "single":
            create_excel_single_sheet(tables_by_page, str(output_path))
        else:
            create_excel_multiple_sheets(tables_by_page, str(output_path))
        
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())