// Internal HTTP endpoint exposing the routing orchestrator. Useful for testing the fallback chain
// without going through Telegram. Body: { origin: string, destination: string }.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { geocode } from "@/lib/routing/nominatim";
import { getRoute } from "@/lib/routing/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<Response> {
  const json: unknown = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const [o, d] = await Promise.all([geocode(parsed.data.origin), geocode(parsed.data.destination)]);
    const route = await getRoute({ lat: o.lat, lng: o.lng }, { lat: d.lat, lng: d.lng });
    return NextResponse.json({
      origin: o,
      destination: d,
      route: {
        miles: route.miles,
        durationMinutes: route.durationMinutes,
        provider: route.provider,
        providersTried: route.providersTried,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
