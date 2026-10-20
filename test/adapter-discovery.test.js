import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AdapterRegistry, loadAdapters } from "../src/core/adapter-loader.js";
import { executeResolvedCapability } from "../src/core/executor.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "axf-adapter-discovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "adapters"));
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  return root;
}

async function writeAdapter(dir) {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "adapter.manifest.json"),
    JSON.stringify({
      manifestVersion: "axf/v0",
      kind: "type-adapter",
      type: "declared",
      entry: "index.js",
      lifecycleState: "active",
    }),
  );
  await writeFile(
    path.join(dir, "index.js"),
    "export async function execute() { return { ok: true, data: 'declared' }; }\n",
  );
}

for (const scope of ["global", "toolspace-private"]) {
  const toolspace = scope === "toolspace-private" ? "demo" : null;
  const lookupOpts = toolspace ? { toolspace } : undefined;
  const relativeRoot = toolspace
    ? path.join("toolspaces", toolspace, "adapters")
    : "adapters";

  test(`${scope} discovery ignores source directories and loads declared adapters`, async (t) => {
    const root = await fixture(t);
    const adaptersRoot = path.join(root, relativeRoot);
    const sourceDir = path.join(adaptersRoot, "community_mod");
    await mkdir(sourceDir, { recursive: true });
    await writeFile(path.join(sourceDir, "runtime.cpp"), "// product source\n");
    await writeFile(
      path.join(sourceDir, "index.js"),
      "throw new Error('product code must not load');\n",
    );
    await writeAdapter(path.join(adaptersRoot, "declared"));

    const adapters = await loadAdapters({
      rootDir: root,
      enableFrameworkFallback: false,
    });
    assert.deepEqual(adapters.loadIssues, []);
    assert.equal(adapters.adapterCount, 1);
    assert.equal(adapters.get("community_mod", lookupOpts), undefined);
    assert.equal(adapters.get("declared", lookupOpts).toolspace, toolspace);
    const result = await adapters.get("declared", lookupOpts).execute();
    assert.equal(result.data, "declared");
  });

  test(`${scope} discovery reports malformed, invalid, and unreadable present manifests`, async (t) => {
    const root = await fixture(t);
    const adaptersRoot = path.join(root, relativeRoot);
    const malformed = path.join(adaptersRoot, "malformed");
    const invalid = path.join(adaptersRoot, "invalid");
    const unreadable = path.join(adaptersRoot, "unreadable");
    await mkdir(malformed, { recursive: true });
    await mkdir(invalid, { recursive: true });
    await mkdir(path.join(unreadable, "adapter.manifest.json"), { recursive: true });
    await writeFile(path.join(malformed, "adapter.manifest.json"), "{ invalid json");
    await writeFile(
      path.join(invalid, "adapter.manifest.json"),
      JSON.stringify({ manifestVersion: "axf/v0", kind: "type-adapter" }),
    );

    const adapters = await loadAdapters({
      rootDir: root,
      enableFrameworkFallback: false,
    });
    assert.equal(adapters.adapterCount, 0);
    assert.ok(adapters.loadIssues.some((issue) =>
      issue.severity === "error" &&
      /malformed.*adapter.manifest.json failed to load/.test(issue.message),
    ));
    assert.ok(adapters.loadIssues.some((issue) =>
      issue.severity === "error" && /invalid.*missing 'entry'/.test(issue.message),
    ));
    assert.ok(adapters.loadIssues.some((issue) =>
      issue.severity === "error" &&
      /unreadable.*adapter.manifest.json failed to load/.test(issue.message),
    ));
  });

  test(`${scope} source directories do not satisfy referenced adapters`, async (t) => {
    const root = await fixture(t);
    const adaptersRoot = path.join(root, relativeRoot);
    await mkdir(path.join(adaptersRoot, "community_mod"), { recursive: true });
    await writeAdapter(path.join(adaptersRoot, "declared"));
    const adapters = await loadAdapters({
      rootDir: root,
      enableFrameworkFallback: false,
    });
    const capability = {
      id: "global.fixture.run",
      adapterType: "community_mod",
      ...(toolspace ? { mount: { toolspace } } : {}),
      policies: [],
    };

    await assert.rejects(
      () => executeResolvedCapability({ capability, args: {} }, { adapters }),
      /no adapter loaded for type 'community_mod'/,
    );
    await assert.rejects(
      () => executeResolvedCapability({
        capability: {
          ...capability,
          adapterType: "declared",
          providerAdapter: "community_mod",
        },
        args: {},
      }, { adapters }),
      /declares providerAdapter 'community_mod' but no provider adapter is loaded/,
    );
  });
}

test("explicit loadAdapter reports a missing manifest", async (t) => {
  const root = await fixture(t);
  const adapterDir = path.join(root, "adapters", "missing");
  await mkdir(adapterDir);
  const adapters = new AdapterRegistry(root);
  await adapters.loadAdapter(adapterDir);
  assert.equal(adapters.adapterCount, 0);
  assert.equal(adapters.loadIssues.length, 1);
  assert.equal(adapters.loadIssues[0].severity, "error");
  assert.match(
    adapters.loadIssues[0].message,
    /missing.*adapter.manifest.json failed to load.*ENOENT/,
  );
});
