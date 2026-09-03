// @vitest-environment jsdom
// app/routes/healthcheck.tsx has no loader — React Router renders its
// default export directly and returns a 200 as long as rendering doesn't
// throw. This asserts the healthy response body (SITE-004).
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("healthcheck route [SITE-004]", () => {
  it("renders 'OK' so the document response is a healthy 200", async () => {
    const { default: Healthcheck } = await import("./healthcheck");
    render(<Healthcheck />);

    expect(screen.getByText("OK")).toBeInTheDocument();
  });
});
