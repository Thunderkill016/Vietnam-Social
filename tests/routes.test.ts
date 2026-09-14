import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/lib/supabase", () => ({ requestSupabase: vi.fn(() => null) }));
import { GET as BOOTSTRAP } from "../src/app/api/bootstrap/route";
import { GET as AUTH_ME } from "../src/app/api/auth/me/route";
import { GET, POST } from "../src/app/api/signals/route";
import { POST as ACT } from "../src/app/api/signals/[id]/route";
import {
  GET as INVITES_GET,
  POST as INVITES_POST,
} from "../src/app/api/invites/route";
import { POST as ACCEPT_INVITE } from "../src/app/api/invites/accept/route";
import { POST as HOST_ONBOARDING } from "../src/app/api/host/onboarding/route";
import {
  GET as TEMPLATES_GET,
  POST as TEMPLATES_POST,
  DELETE as TEMPLATES_DELETE,
} from "../src/app/api/host/templates/route";
import {
  GET as VENUES_GET,
  POST as VENUES_POST,
  PATCH as VENUES_PATCH,
} from "../src/app/api/venues/route";
import { GET as OPS_DASHBOARD } from "../src/app/api/ops/dashboard/route";
import { POST as RECORD_EVENT } from "../src/app/api/events/route";
import { requestSupabase } from "../src/lib/supabase";
import {
  GET as PLACE_GET,
  POST as PLACE_FOLLOW,
} from "../src/app/api/places/[id]/route";
import { GET as LOCAL_FOLLOWS } from "../src/app/api/follows/local/route";

const placeParams = {
  params: Promise.resolve({ id: "10000000-0000-4000-8000-000000000401" }),
};
it("place reads reject invalid ids and do not invent demo places", async () => {
  expect(
    (
      await PLACE_GET(new Request("http://localhost"), {
        params: Promise.resolve({ id: "bad" }),
      })
    ).status,
  ).toBe(404);
  expect(
    (await PLACE_GET(new Request("http://localhost"), placeParams)).status,
  ).toBe(404);
});
it("local follows require authentication and never accept client GPS", async () => {
  const rpc = vi.fn();
  vi.mocked(requestSupabase).mockReturnValue({ rpc } as unknown as NonNullable<
    ReturnType<typeof requestSupabase>
  >);
  expect((await LOCAL_FOLLOWS(new Request("http://localhost"))).status).toBe(
    401,
  );
  expect(
    (
      await PLACE_FOLLOW(
        new Request("http://localhost", { method: "POST" }),
        placeParams,
      )
    ).status,
  ).toBe(401);
  for (const target of ["place", "area"]) {
    expect(
      (
        await PLACE_FOLLOW(
          new Request("http://localhost", {
            method: "POST",
            headers: { Authorization: "Bearer test" },
            body: JSON.stringify({ target, follow: true, latitude: 10.78 }),
          }),
          placeParams,
        )
      ).status,
    ).toBe(400);
  }
  expect(rpc).not.toHaveBeenCalled();
});
it("place mutation forwards only the route id and boolean intent", async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: { following: true, follower_count: 1 },
    error: null,
  });
  vi.mocked(requestSupabase).mockReturnValue({ rpc } as unknown as NonNullable<
    ReturnType<typeof requestSupabase>
  >);
  expect(
    (
      await PLACE_FOLLOW(
        new Request("http://localhost", {
          method: "POST",
          headers: { Authorization: "Bearer test" },
          body: JSON.stringify({ target: "place", follow: true }),
        }),
        placeParams,
      )
    ).status,
  ).toBe(200);
  expect(rpc).toHaveBeenCalledWith("set_place_follow", {
    p_place_id: (await placeParams.params).id,
    p_follow: true,
  });
});

beforeEach(() => vi.mocked(requestSupabase).mockReturnValue(null));

it("bootstrap provides city configuration for HCMC", async () => {
  const response = await BOOTSTRAP();
  const body = await response.json();
  expect(body.mode).toBe("demo");
  expect(body.city).toBeDefined();
  expect(body.city.id).toBe("hcm");
  expect(body.city.slug).toBe("ho-chi-minh");
  expect(body.city.timezone).toBe("Asia/Ho_Chi_Minh");
  expect(body.places).toBeInstanceOf(Array);
});

it("demo discovery is explicitly labeled and viewport bounded", async () => {
  const response = await GET(
    new Request(
      "http://localhost/api/signals?west=106.67&east=106.68&south=10.8&north=10.81",
    ),
  );
  const body = await response.json();
  expect(body.mode).toBe("demo");
  expect(body.signals).toHaveLength(1);
  expect(body.signals[0].is_demo).toBe(true);
});

it("rejects bad viewport at API boundary", async () =>
  expect(
    (await GET(new Request("http://localhost/api/signals?west=0"))).status,
  ).toBe(400));

it("demo cannot claim successful creation", async () =>
  expect(
    (
      await POST(
        new Request("http://localhost/api/signals", { method: "POST" }),
      )
    ).status,
  ).toBe(503));

it("demo cannot claim successful attendance", async () =>
  expect(
    (
      await ACT(new Request("http://localhost", { method: "POST" }), {
        params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
      })
    ).status,
  ).toBe(503));

it("anonymous live mutation is denied before calling database", async () => {
  const rpc = vi.fn();
  vi.mocked(requestSupabase).mockReturnValue({ rpc } as unknown as NonNullable<
    ReturnType<typeof requestSupabase>
  >);
  expect(
    (await POST(new Request("http://localhost", { method: "POST" }))).status,
  ).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});

it("live database failures do not fall back to sample activity", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "503" } });
  vi.mocked(requestSupabase).mockReturnValue({ rpc } as unknown as NonNullable<
    ReturnType<typeof requestSupabase>
  >);
  const response = await GET(new Request("http://localhost/api/signals"));
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty("signals");
});

it("auth/me returns null viewer when unauthenticated or in demo mode", async () => {
  const response = await AUTH_ME(new Request("http://localhost/api/auth/me"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.viewer).toBeNull();
});

it("auth/me returns viewer profile when bearer token is authenticated", async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: { id: "user-123", role: "member", display_name: "Nguyễn Văn A" },
    error: null,
  });
  vi.mocked(requestSupabase).mockReturnValue({ rpc } as unknown as NonNullable<
    ReturnType<typeof requestSupabase>
  >);
  const response = await AUTH_ME(
    new Request("http://localhost/api/auth/me", {
      headers: { Authorization: "Bearer valid-token" },
    }),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.viewer).toEqual({
    id: "user-123",
    role: "member",
    display_name: "Nguyễn Văn A",
  });
  expect(rpc).toHaveBeenCalledWith("viewer_profile");
});

it("auth/me returns 401 when token is expired or profile RPC fails", async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: null,
    error: { message: "JWT expired" },
  });
  vi.mocked(requestSupabase).mockReturnValue({ rpc } as unknown as NonNullable<
    ReturnType<typeof requestSupabase>
  >);
  const response = await AUTH_ME(
    new Request("http://localhost/api/auth/me", {
      headers: { Authorization: "Bearer expired-token" },
    }),
  );
  expect(response.status).toBe(401);
  const body = await response.json();
  expect(body.error).toContain("Phiên đăng nhập hết hạn");
});

it("denies unauthenticated host invite creation", async () => {
  const res = await INVITES_POST(
    new Request("http://localhost/api/invites", { method: "POST" }),
  );
  expect(res.status).toBe(401);
});

it("inspects host invite by token", async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: {
      id: "inv-1",
      status: "pending",
      expires_at: "2026-09-20T10:00:00Z",
    },
    error: null,
  });
  vi.mocked(requestSupabase).mockReturnValue({ rpc } as unknown as NonNullable<
    ReturnType<typeof requestSupabase>
  >);
  const res = await INVITES_GET(
    new Request("http://localhost/api/invites?token=abc123token"),
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.invite.id).toBe("inv-1");
  expect(rpc).toHaveBeenCalledWith("inspect_host_invite", {
    p_token: "abc123token",
  });
});

it("denies unauthenticated host invite acceptance", async () => {
  const res = await ACCEPT_INVITE(
    new Request("http://localhost/api/invites/accept", { method: "POST" }),
  );
  expect(res.status).toBe(401);
});

it("denies unauthenticated host onboarding", async () => {
  const res = await HOST_ONBOARDING(
    new Request("http://localhost/api/host/onboarding", { method: "POST" }),
  );
  expect(res.status).toBe(401);
});

it("returns empty templates when unauthenticated", async () => {
  const res = await TEMPLATES_GET(
    new Request("http://localhost/api/host/templates"),
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.templates).toEqual([]);
});

it("denies unauthenticated template creation", async () => {
  const res = await TEMPLATES_POST(
    new Request("http://localhost/api/host/templates", { method: "POST" }),
  );
  expect(res.status).toBe(401);
});

it("denies unauthenticated template deletion", async () => {
  const res = await TEMPLATES_DELETE(
    new Request("http://localhost/api/host/templates?id=tmpl-1", {
      method: "DELETE",
    }),
  );
  expect(res.status).toBe(401);
});

it("venues GET returns places and authorized venue ids in demo mode", async () => {
  const res = await VENUES_GET(new Request("http://localhost/api/venues"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.places).toBeInstanceOf(Array);
  expect(body.authorized_venue_ids).toBeInstanceOf(Array);
});

it("denies unauthenticated venue suggestion", async () => {
  const res = await VENUES_POST(
    new Request("http://localhost/api/venues", { method: "POST" }),
  );
  expect(res.status).toBe(401);
});

it("denies unauthenticated venue management patch", async () => {
  const res = await VENUES_PATCH(
    new Request("http://localhost/api/venues", { method: "PATCH" }),
  );
  expect(res.status).toBe(401);
});

it("denies unauthenticated ops dashboard metrics access", async () => {
  const res = await OPS_DASHBOARD(
    new Request("http://localhost/api/ops/dashboard"),
  );
  expect(res.status).toBe(401);
});

it("ops dashboard returns metrics for moderator role", async () => {
  const rpc = vi.fn((fnName: string) => {
    if (fnName === "viewer_profile") {
      return Promise.resolve({
        data: { id: "mod-1", role: "moderator" },
        error: null,
      });
    }
    if (fnName === "supply_dashboard_metrics") {
      return Promise.resolve({
        data: {
          hosts: {
            invited: 10,
            accepted: 5,
            onboarded: 5,
            published_at_least_one: 3,
            published_again: 2,
          },
          venues: {
            approved: 4,
            disabled: 0,
            pending_review: 1,
            host_linked: 3,
          },
          supply: {
            signals_created_7d: 12,
            signals_active_now: 2,
            by_category: { sport: 8, workshop: 4 },
          },
          demand: {
            total_impressions: 150,
            total_qualified_opens: 40,
            total_confirmed_actions: 15,
          },
          gate_7d: {
            active_hosts: { actual: 3, target: 5, status: "IN PROGRESS" },
            recurrent_hosts: { actual: 2, target: 3, status: "IN PROGRESS" },
            active_venues: { actual: 3, target: 3, status: "PASS" },
            confirmed_activities: { actual: 15, target: 10, status: "PASS" },
            overall: "IN PROGRESS",
          },
        },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });

  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({ data: [], error: null })),
    })),
  }));

  vi.mocked(requestSupabase).mockReturnValue({
    rpc,
    from,
  } as unknown as NonNullable<ReturnType<typeof requestSupabase>>);

  const res = await OPS_DASHBOARD(
    new Request("http://localhost/api/ops/dashboard", {
      headers: { Authorization: "Bearer mod-token" },
    }),
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.metrics.gate_7d.overall).toBe("IN PROGRESS");
  expect(body.metrics.gate_7d.active_venues.status).toBe("PASS");
});

it("records valid client analytics events via /api/events", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  vi.mocked(requestSupabase).mockReturnValue({ rpc } as unknown as NonNullable<
    ReturnType<typeof requestSupabase>
  >);

  const res = await RECORD_EVENT(
    new Request("http://localhost/api/events", {
      method: "POST",
      body: JSON.stringify({
        type: "signal_opened",
        signal_id: "s1",
        city_id: "hcm",
        category: "sport",
        is_qualified: true,
        duration_ms: 2000,
      }),
    }),
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.recorded).toBe(true);
  expect(rpc).toHaveBeenCalledWith("record_client_event", expect.anything());
});

it("rejects invalid analytics event payload at API boundary", async () => {
  const res = await RECORD_EVENT(
    new Request("http://localhost/api/events", {
      method: "POST",
      body: JSON.stringify({ type: "invalid_event_type" }),
    }),
  );
  expect(res.status).toBe(400);
});
