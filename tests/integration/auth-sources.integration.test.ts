import { describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as demoLogin } from "@/app/api/auth/demo/[role]/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as createSource } from "@/app/api/sources/route";
import { PUT as updateSource } from "@/app/api/sources/[id]/route";
import { GET as staleSources } from "@/app/api/sources/stale/route";
import { POST as uploadSource } from "@/app/api/sources/upload/route";
import { createImageOnlyPdfBuffer } from "../fixtures/create-fixtures";
import { createSource as sourceFactory, createUser, createWorkspace, integrationDb, jsonBody, requestFor, roleParams, routeParams } from "./database";

describe("authentication route handlers", () => {
  it("logs in with a valid password and rejects a wrong password", async () => {
    const workspace = await createWorkspace();
    const user = await createUser(workspace.id, "creator", { email: "login@integration.test", password: "GoodPassword2026!" });
    const good = await login(await requestFor(user, "/api/auth/login", { method: "POST", body: jsonBody({ email: user.email, password: user.password }) }));
    expect(good.status).toBe(200);
    expect(good.headers.get("set-cookie")).toContain("brandlens_token=");
    const bad = await login(await requestFor(user, "/api/auth/login", { method: "POST", body: jsonBody({ email: user.email, password: "incorrect" }) }));
    expect(bad.status).toBe(401);
  });

  it("allows demo login only when DEMO_MODE is enabled", async () => {
    const previous = process.env.DEMO_MODE;
    try {
      process.env.DEMO_MODE = "false";
      expect((await demoLogin(await requestFor({} as never, "/api/auth/demo/creator", { method: "POST" }, { cookie: false }), roleParams("creator"))).status).toBe(403);
      process.env.DEMO_MODE = "true";
      const result = await demoLogin(await requestFor({} as never, "/api/auth/demo/creator", { method: "POST" }, { cookie: false }), roleParams("creator"));
      expect(result.status).toBe(200);
      expect(result.headers.get("set-cookie")).toContain("brandlens_token=");
    } finally {
      if (previous === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = previous;
    }
  });

  it("returns 401 without a cookie and 403 when the caller lacks the route role", async () => {
    const workspace = await createWorkspace();
    const creator = await createUser(workspace.id, "creator");
    expect((await me(await requestFor(creator, "/api/auth/me", {}, { cookie: false }))).status).toBe(401);
    expect((await createSource(await requestFor(creator, "/api/sources", { method: "POST", body: jsonBody({}) }))).status).toBe(403);
  });

  it("rejects POST requests with missing or forged Origin headers", async () => {
    const workspace = await createWorkspace();
    const admin = await createUser(workspace.id, "admin");
    const payload = { type: "guide", title: "Guide", owner: "Brand", content: "Approved words." };
    const missing = await createSource(await requestFor(admin, "/api/sources", { method: "POST", body: jsonBody(payload) }, { origin: null }));
    const forged = await createSource(await requestFor(admin, "/api/sources", { method: "POST", body: jsonBody(payload) }, { origin: "https://forged.example" }));
    expect(missing.status).toBe(403);
    expect(forged.status).toBe(403);
  });
});

describe("source route handlers", () => {
  it("creates and edits sources while keeping versions and rebuilding chunks", async () => {
    const workspace = await createWorkspace();
    const admin = await createUser(workspace.id, "admin");
    const created = await createSource(await requestFor(admin, "/api/sources", { method: "POST", body: jsonBody({ type: "glossary", title: "Terms", owner: "Brand", content: "AVOID: old term -> USE: new term" }) }));
    expect(created.status).toBe(201);
    const createdJson = await created.json() as { source: { id: string } };
    const updated = await updateSource(await requestFor(admin, `/api/sources/${createdJson.source.id}`, { method: "PUT", body: jsonBody({ content: "AVOID: outdated phrase -> USE: approved phrase\nAVOID: bad -> USE: good" }) }), routeParams(createdJson.source.id));
    expect(updated.status).toBe(200);
    const [versions, chunks, source] = await Promise.all([
      integrationDb.sourceVersion.count({ where: { sourceId: createdJson.source.id } }),
      integrationDb.chunk.findMany({ where: { sourceId: createdJson.source.id }, orderBy: { position: "asc" } }),
      integrationDb.source.findUniqueOrThrow({ where: { id: createdJson.source.id } }),
    ]);
    expect(versions).toBe(2);
    expect(source.version).toBe(2);
    expect(chunks.map((chunk) => chunk.text)).toEqual(["AVOID: outdated phrase -> USE: approved phrase", "AVOID: bad -> USE: good"]);
  });

  it("returns expired active sources from the stale endpoint", async () => {
    const workspace = await createWorkspace();
    const admin = await createUser(workspace.id, "admin");
    await sourceFactory(workspace.id, admin.id, { expiresAt: new Date(Date.now() - 60_000) });
    const response = await staleSources(await requestFor(admin, "/api/sources/stale"));
    expect((await response.json()).count).toBe(1);
  });

  it("rejects unsupported extensions, invalid magic bytes, and image-only PDFs", async () => {
    const workspace = await createWorkspace();
    const admin = await createUser(workspace.id, "admin");
    const upload = async (name: string, bytes: Buffer) => {
      const form = new FormData(); form.set("file", new File([bytes], name));
      return uploadSource(await requestFor(admin, "/api/sources/upload", { method: "POST", body: form }));
    };
    expect((await upload("bad.exe", Buffer.from("binary"))).status).toBe(400);
    expect((await upload("bad.pdf", Buffer.from("not pdf"))).status).toBe(400);
    const scanned = await upload("scan.pdf", createImageOnlyPdfBuffer());
    expect(scanned.status).toBe(422);
    expect((await scanned.json()).error).toContain("scanned document");
  });
});
