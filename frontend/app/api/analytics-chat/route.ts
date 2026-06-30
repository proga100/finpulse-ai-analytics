const backendApiBaseUrl = process.env.BACKEND_API_BASE_URL ?? "http://localhost:8000";
const analyticsApiToken = process.env.ANALYTICS_API_TOKEN ?? "";

export async function POST(request: Request) {
  const payload = await request.json();

  // Forward the demo session id and the real client IP so the backend's
  // per-visitor quota (session id + IP backstop) works behind nginx + Next.js.
  const fwd = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${analyticsApiToken}`,
    "Content-Type": "application/json",
    "X-Demo-Session": request.headers.get("x-demo-session") ?? ""
  };
  if (fwd) headers["X-Forwarded-For"] = fwd;
  else if (realIp) headers["X-Forwarded-For"] = realIp;

  const response = await fetch(`${backendApiBaseUrl}/api/admin/analytics-chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  // Pipe the readable stream back to the client.
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
