import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return { user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user: session.user, response: null };
}

export function sameOriginResponse(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return null;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return null;
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  try {
    if (new URL(origin).origin !== `${protocol}://${host}`) {
      return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  }

  return null;
}
