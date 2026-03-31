import Link from "next/link"
import { FileText } from "lucide-react"

const toolCategories = [
  {
    title: "Organize",
    links: [
      { href: "/tools/merge-pdf", label: "Merge PDF" },
      { href: "/tools/split-pdf", label: "Split PDF" },
      { href: "/tools/remove-pages", label: "Remove Pages" },
      { href: "/tools/organize-pdf", label: "Organize PDF" },
    ],
  },
  {
    title: "Convert",
    links: [
      { href: "/tools/pdf-to-word", label: "PDF to Word" },
      { href: "/tools/word-to-pdf", label: "Word to PDF" },
      { href: "/tools/pdf-to-jpg", label: "PDF to JPG" },
      { href: "/tools/jpg-to-pdf", label: "JPG to PDF" },
    ],
  },
  {
    title: "Optimize",
    links: [
      { href: "/tools/compress-pdf", label: "Compress PDF" },
      { href: "/tools/repair-pdf", label: "Repair PDF" },
      { href: "/tools/ocr-pdf", label: "OCR PDF" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/features", label: "Features" },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Main footer */}
        <div className="grid grid-cols-2 gap-8 py-12 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <FileText className="h-4 w-4" />
              </div>
              <span className="text-lg font-bold">
                PDF<span className="text-primary">Tools</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">
              Free online PDF tools to transform your documents. Fast, secure,
              and easy to use.
            </p>
          </div>

          {/* Link columns */}
          {toolCategories.map((category) => (
            <div key={category.title}>
              <h3 className="text-sm font-semibold mb-3">{category.title}</h3>
              <ul className="space-y-2">
                {category.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border/40 py-6 flex flex-col items-center justify-center gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} PDFTools. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
