import { describe, expect, it, vi } from "vitest";
import { ApiError, api, errorMessage } from "./api";

const response = (status: number, body: string) => new Response(body, { status });

describe("errorMessage", () => {
  it("uses the server's plain-text reason", async () => {
    expect(await errorMessage(response(502, JSON.stringify({ detail: "The tutor model is unavailable right now" })))).toBe(
      "The tutor model is unavailable right now",
    );
  });

  it("uses the first validation message", async () => {
    const body = JSON.stringify({ detail: [{ loc: ["body", "user_id"], msg: "String should match pattern" }] });
    expect(await errorMessage(response(422, body))).toBe("String should match pattern");
  });

  it("explains an empty reply", async () => {
    expect(await errorMessage(response(502, ""))).toMatch(/empty reply \(HTTP 502\)/);
  });
});

describe("api", () => {
  it("turns a network failure into a readable error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(api.health()).rejects.toThrow("Can't reach the LearnLoop server");
  });

  it("reports the HTTP status on failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(503, JSON.stringify({ detail: "Memory service unavailable" })));

    const error = await api.memories("demo-student").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, message: "Memory service unavailable" });
  });

  it("encodes the learner id in the URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await api.forget("demo-student");

    expect(fetchMock).toHaveBeenCalledWith("/api/users/demo-student/memories", expect.objectContaining({ method: "DELETE" }));
  });
});
