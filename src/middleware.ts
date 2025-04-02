import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

// const NAMESPACE = "https://yourapp.com/";

export async function middleware(request: NextRequest) {
  const authRes = await auth0.middleware(request);

  // Bypass auth0 routes
  if (
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/api/auth")
  ) {
    return authRes;
  }

  const session = await auth0.getSession(request);

  if (!session) {
    console.log("🔒 No session — redirecting to login:", request.nextUrl.pathname);
    return NextResponse.redirect(new URL("/auth/login", request.nextUrl.origin));
  }

  const roles = session.user?.["https://yourapp.com/roles"] || [];
  const email = session.user?.email;

  // Log full session object
  console.log("🧾 Session.user = ", session.user);
  // Log user and their roles
  console.log(`👤 User: ${email || "Unknown"} | Roles: ${JSON.stringify(roles)}`);

  // Log if unauthorized access to /admin
  if (request.nextUrl.pathname.startsWith("/admin") && !roles.includes("admin")) {
    console.log(`🚨 Unauthorized admin access attempt by ${email} at ${request.nextUrl.pathname}`);
    // You can still allow access if you’re just logging
  }
  return authRes;
}
