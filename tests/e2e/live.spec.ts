import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_SERVICE_KEY;
const dbUrl = process.env.LOCAL_DB_URL;
test.skip(!url || !key || !dbUrl, "Requires isolated local Supabase; never use production.");
function localSql(sql: string) {
  if (!dbUrl || !["127.0.0.1", "localhost"].includes(new URL(dbUrl).hostname)) throw new Error("Local database only");
  return execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8" });
}
test("two independent authenticated sessions: publish, join, confirm, broadcast and expire", async ({ browser }) => {
  test.setTimeout(120_000);
  if (!url || !key || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Local Supabase only");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const run = randomUUID().slice(0, 8), password = `Local-only-${randomUUID()}`;
  const hostEmail = `host-${run}@test.local`, memberEmail = `member-${run}@test.local`;
  const host = await admin.auth.admin.createUser({ email: hostEmail, password, email_confirm: true });
  const member = await admin.auth.admin.createUser({ email: memberEmail, password, email_confirm: true });
  if (host.error || member.error || !host.data.user || !member.data.user) throw new Error("Local test identity creation failed");
  const hostId = host.data.user.id;
  if (!/^[a-f0-9-]{36}$/.test(hostId)) throw new Error("Unexpected user ID");
  localSql(`update app_private.profiles set role='host',display_name='Host local E2E' where id='${hostId}'; insert into app_private.host_venue_memberships(host_id,place_id,granted_by) values('${hostId}','10000000-0000-4000-8000-000000000001','${hostId}') on conflict do nothing;`);
  const hostContext = await browser.newContext(), memberContext = await browser.newContext();
  const h = await hostContext.newPage(), m = await memberContext.newPage();
  try {
    for (const [page, email] of [[h, hostEmail],[m, memberEmail]] as const) {
      await page.goto("/activities");
      await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
      await page.getByRole("dialog").getByRole("button", { name: "Đăng nhập", exact: true }).click();
      await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
    }
    await h.getByRole("button", { name: "Đăng hoạt động", exact: true }).click();
    const title = `Cầu lông kiểm thử ${run}`;
    await h.getByLabel("Tên hoạt động", { exact: true }).fill(title);
    await h.getByLabel("Địa điểm công cộng", { exact: true }).selectOption("10000000-0000-4000-8000-000000000001");
    const vietnamInput = (time: number) => new Date(time + 7 * 3_600_000).toISOString().slice(0, 16);
    await h.getByLabel("Bắt đầu (giờ Việt Nam)", { exact: true }).fill(vietnamInput(Date.now() - 5 * 60_000));
    await h.getByLabel("Kết thúc (giờ Việt Nam)", { exact: true }).fill(vietnamInput(Date.now() + 60 * 60_000));
    await h.getByRole("dialog").getByRole("button", { name: "Đăng hoạt động", exact: true }).click();
    await expect(h.getByRole("dialog").getByRole("heading", { name: title })).toBeVisible();
    await expect(h.getByRole("button", { name: "Đang diễn ra", exact: true })).toBeDisabled();
    await expect(m.getByRole("button", { name: new RegExp(`Thể thao.*${title}`) })).toBeVisible({ timeout: 8000 });
    await m.getByRole("button", { name: new RegExp(`Thể thao.*${title}`) }).click();
    await m.getByRole("button", { name: "Tôi muốn tham gia", exact: true }).click();
    await expect(m.getByRole("button", { name: "Đã tham gia", exact: true })).toBeDisabled();
    await m.getByRole("button", { name: "Đang diễn ra", exact: true }).click();
    await expect(h.getByText("Có xác nhận · 1 xác nhận", { exact: true })).toBeVisible({ timeout: 8000 });
    await h.screenshot({ path: "artifacts/live-host.png" });
    await m.screenshot({ path: "artifacts/live-member.png" });
    const signalId = localSql(`select id from app_private.signals where author_id='${hostId}' order by created_at desc limit 1`).trim();
    if (!/^[a-f0-9-]{36}$/.test(signalId)) throw new Error("Unexpected signal ID");
    const access = (await admin.auth.signInWithPassword({ email: memberEmail, password })).data.session?.access_token;
    const retry = await m.request.post(`/api/signals/${signalId}`, { headers: { Authorization: `Bearer ${access}` }, data: { action: "confirm" } });
    expect(retry.ok()).toBe(true);
    expect(localSql(`select count(*) from app_private.actions where signal_id='${signalId}' and value='confirm'`).trim()).toBe("1");
    localSql(`update app_private.signals set starts_at=now()-interval '1 hour',expires_at=now()+interval '3 seconds' where id='${signalId}'`);
    await expect(h.getByRole("dialog")).toHaveCount(0, { timeout: 25_000 });
    await expect(m.getByRole("dialog")).toHaveCount(0, { timeout: 25_000 });
    expect((await m.request.get(`/api/signals/${signalId}`)).status()).toBe(404);
  } finally {
    await hostContext.close();
    await memberContext.close();
  }
});
