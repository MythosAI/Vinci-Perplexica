// components/Header.tsx
'use client'

import { useUser } from '@auth0/nextjs-auth0'
import Link from 'next/link'
import Image from 'next/image'

export default function Header() {
  const { user, error, isLoading } = useUser()

  if (isLoading) return <div className="p-4 bg-gray-100">Loading...</div>
  if (error) return <div className="p-4 bg-red-100 text-red-600">{error.message}</div>

  return (
    <header className="flex justify-between items-center px-6 py-4 border-b shadow-sm lg:pl-24 bg-light-primary dark:bg-dark-primary">

  <div className="text-xl font-bold">Vinci Stockalyzer</div>
  <nav className="flex items-center gap-4">
    {user ? (
      <Link
        href="auth/logout"
        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
      >
        Logout
      </Link>
    ) : (
      <Link
        href="auth/login"
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
      >
        Login
      </Link>
    )}
  </nav>
</header>

  )
}
