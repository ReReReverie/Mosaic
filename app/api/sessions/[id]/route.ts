import { NextResponse } from "next/server";
import { getAnalysisSession } from "@/lib/sessionStore";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid session ID." }, { status: 400 });
  }

  const result = await getAnalysisSession(id);
  if (!result) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json(
    { result },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
