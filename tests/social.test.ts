import { describe, expect, it } from "vitest";
import {
  createLocalPostSchema,
  localPostActionSchema,
  localPostSchema,
} from "../src/lib/social";

const requestId = "30000000-0000-4000-8000-000000000999";
const placeId = "10000000-0000-4000-8000-000000000999";

describe("Local Post domain", () => {
  it("accepts exactly one safe geographic target", () => {
    expect(
      createLocalPostSchema.safeParse({
        request_id: requestId,
        post_type: "question",
        body: "Khu vực này tối nay có gì đang diễn ra?",
        area: "Quận 1",
      }).success,
    ).toBe(true);

    expect(
      createLocalPostSchema.safeParse({
        request_id: requestId,
        post_type: "update",
        body: "Công viên đang có hoạt động cộng đồng.",
        place_id: placeId,
      }).success,
    ).toBe(true);
  });

  it("rejects missing or ambiguous location targets and client coordinates", () => {
    expect(
      createLocalPostSchema.safeParse({
        request_id: requestId,
        post_type: "question",
        body: "Khu vực này tối nay có gì đang diễn ra?",
      }).success,
    ).toBe(false);

    expect(
      createLocalPostSchema.safeParse({
        request_id: requestId,
        post_type: "question",
        body: "Khu vực này tối nay có gì đang diễn ra?",
        area: "Quận 1",
        place_id: placeId,
      }).success,
    ).toBe(false);

    expect(
      createLocalPostSchema.safeParse({
        request_id: requestId,
        post_type: "question",
        body: "Khu vực này tối nay có gì đang diễn ra?",
        area: "Quận 1",
        latitude: 10.78,
        longitude: 106.7,
      }).success,
    ).toBe(false);
  });

  it("bounds content and requires a comment body", () => {
    expect(
      createLocalPostSchema.safeParse({
        request_id: requestId,
        post_type: "recommendation",
        body: "ngắn",
        area: "Quận 1",
      }).success,
    ).toBe(false);

    expect(localPostActionSchema.safeParse({ action: "comment" }).success).toBe(
      false,
    );
    expect(
      localPostActionSchema.safeParse({ action: "comment", body: "Có nhé." })
        .success,
    ).toBe(true);
  });

  it("parses a safe public projection", () => {
    const result = localPostSchema.safeParse({
      id: "40000000-0000-4000-8000-000000000999",
      post_type: "update",
      body: "Phố đi bộ đang chuẩn bị sân khấu cho buổi tối.",
      place_id: placeId,
      place_name: "Phố đi bộ thử nghiệm",
      area: "Quận 1",
      longitude: 106.7,
      latitude: 10.78,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author: {
        id: "20000000-0000-4000-8000-000000000999",
        display_name: "Người đóng góp",
        role: "member",
        organizer_label: "",
        bio: "",
      },
      reaction_count: 1,
      comment_count: 2,
      viewer_reacted: false,
      viewer_reported: false,
      viewer_is_author: false,
    });
    expect(result.success).toBe(true);
  });
});
