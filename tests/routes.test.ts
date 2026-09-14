import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/lib/supabase", () => ({ requestSupabase: vi.fn(() => null) }));
import { GET, POST } from "../src/app/api/signals/route";
import { POST as ACT } from "../src/app/api/signals/[id]/route";
import { requestSupabase } from "../src/lib/supabase";
beforeEach(() => vi.mocked(requestSupabase).mockReturnValue(null));
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
