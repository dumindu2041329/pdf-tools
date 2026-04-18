import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import { Geist, Geist_Mono, Noto_Serif_Display } from "next/font/google"
import { ThemeProvider } from "@/components/theme/ThemeProvider"
import { Toaster } from "@/components/theme/Toaster"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

const notoSerifDisplay = Noto_Serif_Display({
  variable: "--font-noto-serif-display",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "PDFTools — Free Online PDF Tools",
    template: "%s | PDFTools",
  },
  description:
    "Transform your PDFs with 28+ free online tools. Merge, split, compress, convert, and edit PDF files. Powered by iLoveAPI for fast, secure processing.",
  keywords: [
    "PDF tools",
    "merge PDF",
    "split PDF",
    "compress PDF",
    "convert PDF",
    "edit PDF",
    "online PDF",
    "free PDF tools",
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${notoSerifDisplay.variable}`}
      >
        <body
          suppressHydrationWarning
          className="min-h-screen bg-background font-sans antialiased"
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  )
}
