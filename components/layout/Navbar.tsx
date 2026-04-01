"use client"

import Link from "next/link"
import { useState } from "react"
import { usePathname } from "next/navigation"
import {
  SignInButton,
  UserButton,
  useAuth,
  useClerk,
} from "@clerk/nextjs"
import { FileText, Menu, X, ChevronDown } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme/ThemeToggle"
import { ToolsDropdown } from "@/components/layout/ToolsDropdown"
import { cn } from "@/lib/utils"

const navLinks = [
  { href: "/", label: "Tools", hasDropdown: true },
  { href: "/#features", label: "Features", hasDropdown: false },
  { href: "/#about", label: "About", hasDropdown: false },
]

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false)
  const pathname = usePathname()
  const { isSignedIn } = useAuth()
  const { openSignUp } = useClerk()

  const handleGetStarted = () => openSignUp({ forceRedirectUrl: "/" })

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('/#') && pathname === '/') {
      e.preventDefault()
      const destination = href.replace('/#', '')
      const element = document.getElementById(destination)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
        window.history.pushState(null, '', href)
      }
      setMobileOpen(false)
    } else {
      setMobileOpen(false)
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-105">
            <FileText className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">
            PDF<span className="text-primary">Tools</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <div
              key={link.href}
              className={cn(
                link.hasDropdown ? "relative inline-block" : ""
              )}
            >
              {link.hasDropdown ? (
                <div
                  onMouseEnter={() => setToolsDropdownOpen(true)}
                  onMouseLeave={() => setToolsDropdownOpen(false)}
                >
                  <button
                    type="button"
                    onClick={() => setToolsDropdownOpen(!toolsDropdownOpen)}
                    className={cn(
                      "flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer",
                      toolsDropdownOpen
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {link.label}
                    <ChevronDown className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      toolsDropdownOpen && "rotate-180"
                    )} />
                  </button>
                  <ToolsDropdown
                    isOpen={toolsDropdownOpen}
                    onMouseEnter={() => setToolsDropdownOpen(true)}
                    onMouseLeave={() => setToolsDropdownOpen(false)}
                  />
                </div>
              ) : (
                <Link
                  href={link.href}
                  onClick={(e) => handleAnchorClick(e, link.href)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                    pathname === link.href
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {link.label}
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Desktop right side */}
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          {isSignedIn ? (
            <>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "w-9 h-9 ring-2 ring-primary/20",
                  },
                }}
              />
            </>
          ) : (
            <>
              <SignInButton mode="modal">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </SignInButton>
              <Button size="sm" onClick={handleGetStarted}>
                Get Started Free
              </Button>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </nav>

      {/* Mobile nav */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-xl overflow-hidden"
          >
            <div className="px-4 py-4 space-y-2">
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "block px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-accent",
                  pathname === "/" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                )}
              >
                All Tools
              </Link>
              <Link
                href="/#features"
                onClick={(e) => handleAnchorClick(e, "/#features")}
                className={cn(
                  "block px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-accent",
                  pathname === "/#features" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                )}
              >
                Features
              </Link>
              <Link
                href="/#about"
                onClick={(e) => handleAnchorClick(e, "/#about")}
                className={cn(
                  "block px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-accent",
                  pathname === "/#about" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                )}
              >
                About
              </Link>
              <div className="pt-2 border-t border-border/40 space-y-2">
                {isSignedIn ? (
                  <>
                    <UserButton
                      appearance={{
                        elements: {
                          avatarBox: "w-9 h-9 ring-2 ring-primary/20",
                        },
                      }}
                    />
                  </>
                ) : (
                  <div className="flex flex-col gap-2 px-3">
                    <SignInButton mode="modal">
                      <Button variant="outline" className="w-full">
                        Sign in
                      </Button>
                    </SignInButton>
                    <Button className="w-full" onClick={() => { handleGetStarted(); setMobileOpen(false) }}>
                      Get Started Free
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
