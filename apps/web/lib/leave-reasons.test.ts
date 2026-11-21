import { describe, expect, it } from "vitest";
import { cleanLeaveReasons, leaveReasonLabel } from "./leave-reasons";

describe("cleanLeaveReasons", () => {
  it("keeps known ids, deduplicated, in list order", () => {
    expect(cleanLeaveReasons(["other", "too-much", "too-much"])).toEqual(["too-much", "other"]);
  });
  it("drops unknown ids and non-arrays", () => {
    expect(cleanLeaveReasons(["too-much", "<script>", 3, null])).toEqual(["too-much"]);
    expect(cleanLeaveReasons("too-much")).toEqual([]);
    expect(cleanLeaveReasons(undefined)).toEqual([]);
  });
});

describe("leaveReasonLabel", () => {
  it("labels known ids and passes unknown ones through", () => {
    expect(leaveReasonLabel("too-much")).toBe("Too much to read");
    expect(leaveReasonLabel("retired-id")).toBe("retired-id");
  });
});
