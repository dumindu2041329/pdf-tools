from pathlib import Path
import sys

from pdf2docx import Converter


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: pdf_to_docx.py <input-pdf> <output-docx>")

    input_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    converter = Converter(str(input_path))
    try:
        converter.convert(str(output_path))
    finally:
        converter.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
