// app/server/board_permissions_sql.test.ts
// The two board-rights predicates every query shares (ADR-0006, ADR-0027).
// SQL is mocked everywhere else in the suite, so these hold the clauses
// themselves: who facilitates, and who may delete or archive.
import { describe, it, expect } from "vitest";
import { canFacilitateSql, canManageBoardSql } from "./board_permissions_sql";

const norm = (sql: string) => sql.replace(/\s+/g, " ");

describe("canFacilitateSql", () => {
  const sql = norm(canFacilitateSql("b", "$2::uuid"));

  it("admits everyone when open_facilitation is on", () => {
    expect(sql).toContain("b.open_facilitation OR");
  });

  it("admits the board's owner and granted facilitators", () => {
    expect(sql).toContain("FROM board_members");
    expect(sql).toContain("fbm.board_id = b.id AND fbm.user_id = $2::uuid");
    expect(sql).toContain("role IN ('owner', 'facilitator')");
  });

  it("admits the owner of the board's crew, whoever owns the board (ADR-0027)", () => {
    expect(sql).toContain("FROM team_members ftm");
    expect(sql).toContain("ftm.team_id = b.team_id AND ftm.user_id = $2::uuid AND ftm.role = 'owner'");
  });

  it("gives a caller with no user id nothing beyond open facilitation", () => {
    expect(sql).toContain("$2::uuid IS NOT NULL AND");
  });

  it("uses the aliases it is given", () => {
    const other = norm(canFacilitateSql("board", "$1::uuid"));
    expect(other).toContain("board.open_facilitation");
    expect(other).toContain("ftm.team_id = board.team_id AND ftm.user_id = $1::uuid");
    expect(other).not.toContain("b.id");
  });
});

describe("canManageBoardSql", () => {
  const sql = norm(canManageBoardSql("b", "$2::uuid"));

  it("admits the board's owner (ADR-0006)", () => {
    expect(sql).toContain("lbm.board_id = b.id AND lbm.user_id = $2::uuid AND lbm.role = 'owner'");
  });

  it("admits the owner of the board's crew, whoever owns the board (ADR-0027)", () => {
    expect(sql).toContain("FROM team_members ltm");
    expect(sql).toContain("ltm.team_id = b.team_id AND ltm.user_id = $2::uuid AND ltm.role = 'owner'");
  });

  it("never consults open_facilitation or facilitator grants", () => {
    expect(sql).not.toContain("open_facilitation");
    expect(sql).not.toContain("'facilitator'");
  });
});
