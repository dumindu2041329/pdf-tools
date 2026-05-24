"use client"

import { AccountSidebar } from "./_components/AccountSidebar"

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight mb-8">
        Account Settings
      </h1>
      <div className="flex flex-col gap-8 md:flex-row">
        <AccountSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
