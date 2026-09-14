import { describe, expect, it } from "vitest";
import { communitySchema, createCommunitySchema } from "../src/lib/community";

const placeId = "10000000-0000-4000-8000-000000000777";
const communityId = "50000000-0000-4000-8000-000000000777";

describe("Community domain", () => {
  it("accepts exactly one safe geographic target", () => {
    expect(
      createCommunitySchema.safeParse({
        name: "Chạy bộ Gò Vấp",
        description: "Cộng đồng chạy bộ địa phương.",
        category: "sport",
        area: "Gò Vấp",
      }).success,
    ).toBe(true);
    expect(
      createCommunitySchema.safeParse({
        name: "Bạn ảnh Sài Gòn",
        description: "Đi chụp ảnh cuối tuần.",
        category: "hobby",
        place_id: placeId,
      }).success,
    ).toBe(true);
  });

  it("rejects ambiguous targets and raw client coordinates", () => {
    expect(
      createCommunitySchema.safeParse({
        name: "Cộng đồng thử nghiệm",
        category: "other",
        area: "Quận 1",
        place_id: placeId,
      }).success,
    ).toBe(false);
    expect(
      createCommunitySchema.safeParse({
        name: "Cộng đồng thử nghiệm",
        category: "other",
        area: "Quận 1",
        latitude: 10.78,
      }).success,
    ).toBe(false);
  });

  it("parses the public map projection", () => {
    const parsed = communitySchema.safeParse({
      id: communityId,
      name: "Chạy bộ Gò Vấp",
      description: "Cộng đồng chạy bộ địa phương.",
      category: "sport",
      place_id: null,
      place_name: "",
      area: "Gò Vấp",
      longitude: 106.68,
      latitude: 10.84,
      created_at: new Date().toISOString(),
      member_count: 4,
      viewer_is_member: true,
      viewer_role: "member",
      creator: {
        id: "20000000-0000-4000-8000-000000000777",
        display_name: "Người tạo",
        role: "member",
        organizer_label: "",
      },
    });
    expect(parsed.success).toBe(true);
  });
});
