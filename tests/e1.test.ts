import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", () => ({ requestSupabase: vi.fn(() => null) }));

import { analyticsEventSchema } from "../src/lib/analytics";
import { GET as MAP_GET } from "../src/app/api/map/route";
import { POST as RECORD_EVENT } from "../src/app/api/events/route";
import { requestSupabase } from "../src/lib/supabase";

beforeEach(() => {
  vi.mocked(requestSupabase).mockReturnValue(null);
});

describe("Phase E1 evidence integrity", () => {
  it("rejects browser-owned test/demo classification", () => {
    expect(
      analyticsEventSchema.safeParse({
        type: "map_opened",
        city_id: "hcm",
        is_test: true,
      }).success,
    ).toBe(false);
    expect(
      analyticsEventSchema.safeParse({
        type: "map_opened",
        city_id: "hcm",
        is_demo: true,
      }).success,
    ).toBe(false);
  });

  it("does not claim recorded=true when the analytics RPC fails", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "forced database failure" },
    });
    vi.mocked(requestSupabase).mockReturnValue({
      rpc,
    } as unknown as NonNullable<ReturnType<typeof requestSupabase>>);

    const response = await RECORD_EVENT(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "map_opened", city_id: "hcm" }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("recorded", true);
  });

  it("reports recorded=true only after the database RPC succeeds", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(requestSupabase).mockReturnValue({
      rpc,
    } as unknown as NonNullable<ReturnType<typeof requestSupabase>>);

    const response = await RECORD_EVENT(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "map_opened", city_id: "hcm" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recorded: true });
  });

  it("rejects spoofed evidence flags before calling the database", async () => {
    const rpc = vi.fn();
    vi.mocked(requestSupabase).mockReturnValue({
      rpc,
    } as unknown as NonNullable<ReturnType<typeof requestSupabase>>);

    const response = await RECORD_EVENT(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "map_opened",
          city_id: "hcm",
          is_test: true,
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("unified social map API", () => {
  it("returns an honest empty map in demo mode", async () => {
    const response = await MAP_GET(
      new Request(
        "http://localhost/api/map?west=106.62&south=10.77&east=106.73&north=10.86&city_id=hcm",
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mode).toBe("demo");
    expect(body.entities).toEqual([]);
    expect(body.counts).toEqual({
      local_post: 0,
      community: 0,
      activity: 0,
      place: 0,
    });
  });

  it("rejects unbounded map viewports", async () => {
    const response = await MAP_GET(
      new Request(
        "http://localhost/api/map?west=106&south=10&east=107&north=11&city_id=hcm",
      ),
    );
    expect(response.status).toBe(400);
  });
});
