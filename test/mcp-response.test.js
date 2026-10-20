import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { performOperation } from "../src/mcp/operations.js";
import { projectMcpResponse } from "../src/mcp/response.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const root = {
  root: repoRoot,
  source: "explicit",
  viaMarker: true,
  markerPresent: true,
};

const workspaceMetadata = {
  projectRoot: root,
  executionRoot: root,
  workspace: root,
  executionWorkspace: root,
  workspaces: {
    projectRoot: root,
    executionRoot: root,
    registryWorkspace: root,
    executionWorkspace: root,
  },
  notes: [],
};

const operationPayloads = [
  {
    ok: true,
    operation: "help",
    tool: { name: "axf", description: "router" },
    contract: {
      summary: "single router",
      discoveryFlow: ["guide", "inspect", "run"],
      runRules: ["inspect first"],
      boundary: { diagnostic: true },
    },
    operations: [{ name: "run", purpose: "execute", readOnly: false }],
  },
  {
    ok: true,
    operation: "list",
    capabilities: [
      {
        id: "global.echo.say",
        summary: "echo",
        scope: "global",
        registryScope: "global",
        lifecycleState: "active",
        sideEffects: "none",
        provider: "echo",
        manifestPath: "/private/full/manifest.json",
      },
    ],
    total: 1,
    count: 1,
    truncated: false,
    filters: { compact: false },
  },
  {
    ok: true,
    operation: "guide",
    intent: "validation",
    recommendations: [
      {
        intent: "validation",
        label: "check",
        capabilityId: "global.repo.check",
        status: "available",
        lifecycleState: "active",
        sideEffects: "read",
        summary: "check repo",
        provenance: { manifestPath: "/private/manifest.json" },
        inspect: { cli: "axf inspect global.repo.check" },
      },
    ],
    count: 1,
    truncated: false,
    limit: 12,
    warnings: [],
  },
  {
    ok: true,
    operation: "explain",
    query: "global.echo.say",
    status: "available",
    capability: {
      id: "global.echo.say",
      summary: "echo",
      scope: "global",
      registryScope: "global",
      lifecycleState: "active",
      sideEffects: "none",
      sourceKind: "project-manifest",
      provenance: { manifestPath: "/private/manifest.json" },
    },
    reasons: [{ code: "loaded", message: "available" }],
    examples: { run: { cli: "axf run echo say" } },
    suggestions: [],
  },
  {
    ok: true,
    operation: "inspect",
    input: { scope: "global" },
    capability: {
      id: "global.echo.say",
      summary: "echo",
      scope: "global",
      registryScope: "global",
      lifecycleState: "active",
      sideEffects: "none",
      argsSchema: { type: "object" },
      defaults: {},
      policies: [],
      outputModes: ["json"],
      completion: {
        mode: "external-awaitable",
        descriptorSchema: "axf/awaitable/v1",
        observer: "global.wait.external",
      },
      warnings: ["Inspect before execution"],
      details: { report: "generated-report.json" },
      manifestPath: "/private/manifest.json",
    },
    injectedDefaults: {},
    examples: { run: { cli: "axf run echo say" } },
    launchPlan: { command: "node", cwd: repoRoot },
    adapter: { type: "internal" },
  },
  {
    ok: true,
    operation: "doctor",
    status: "ok",
    capabilityCount: 2,
    toolspaceCount: 1,
    manifestCount: 2,
    rejectedCount: 0,
    adapterCount: 2,
    familyCount: 0,
    issues: [],
    runtime: { commands: { axf: "/srv/axf/bin/axf.js" } },
  },
  {
    ok: true,
    operation: "scout_check",
    status: "ok",
    imports: [],
    changeCount: 0,
    changes: [],
    issues: [],
    readOnly: true,
  },
].map((payload) => ({ ...payload, ...workspaceMetadata }));

for (const payload of operationPayloads) {
  test(`${payload.operation} supports standard, compact, and diagnostic response detail`, () => {
    const diagnostic = projectMcpResponse(payload, "diagnostic");
    const standard = projectMcpResponse(payload, "standard");
    const compact = projectMcpResponse(payload, "compact");

    assert.notEqual(diagnostic, payload);
    assert.deepEqual(diagnostic, payload);
    assert.equal(standard.ok, payload.ok);
    assert.equal(standard.operation, payload.operation);
    assert.equal("workspace" in standard, false);
    assert.equal("executionWorkspace" in standard, false);
    assert.equal("workspaces" in standard, false);
    assert.equal(compact.ok, payload.ok);
    assert.equal(compact.operation, payload.operation);
    for (const projected of [compact, standard, diagnostic]) {
      assert.deepEqual(projected.projectRoot, root);
      assert.deepEqual(projected.executionRoot, root);
    }
    assert.ok(JSON.stringify(compact).length <= JSON.stringify(standard).length);
    if (payload.operation === "inspect") {
      assert.deepEqual(compact.capability.warnings, payload.capability.warnings);
      assert.deepEqual(compact.capability.details, payload.capability.details);
      assert.deepEqual(compact.capability.completion, payload.capability.completion);
    }
  });
}

test("run profiles preserve data while removing successful execution traces", () => {
  const data = { answer: [1, 2, 3] };
  const continuations = [
    {
      kind: "wait-external",
      recommended: true,
      reason: "Checks remain externally owned.",
      capability: "global.wait.external",
      args: {
        descriptor: {
          schemaVersion: "axf/awaitable/v1",
          kind: "github.required-checks",
          subject: { repository: "owner/repo", headSha: "a".repeat(40) },
          condition: { type: "all-required-checks-terminal" },
        },
        deadlineMs: 30_000,
      },
    },
  ];
  const payload = {
    ok: true,
    operation: "run",
    capability: {
      id: "global.demo.run",
      scope: "global",
      lifecycleState: "active",
      adapterType: "cli",
      provider: "demo",
      providerAdapter: null,
      sourceCapabilityId: null,
    },
    input: { path: ["demo", "run"] },
    args: { limit: 20 },
    data,
    continuations,
    error: null,
    meta: {
      capabilityId: "global.demo.run",
      adapterType: "cli",
      command: "demo",
      args: ["run", "--limit", "20"],
      cwd: repoRoot,
      launchPlan: { command: "demo", cwd: repoRoot },
      hints: ["Inspect the generated report"],
      policyWarnings: ["read-only workspace"],
    },
    ...workspaceMetadata,
  };

  const standard = projectMcpResponse(payload, "standard");
  const compact = projectMcpResponse(payload, "compact");

  assert.equal(standard.data, data);
  assert.equal(compact.data, data);
  assert.deepEqual(standard.continuations, continuations);
  assert.deepEqual(compact.continuations, continuations);
  assert.deepEqual(standard.meta, {
    hints: ["Inspect the generated report"],
    policyWarnings: ["read-only workspace"],
  });
  assert.deepEqual(compact.meta, standard.meta);
  assert.equal("input" in standard, false);
  assert.equal("error" in standard, false);
  assert.equal("args" in compact, false);
});

test("all run profiles preserve bounded dirty-source provenance facts", () => {
  const data = {
    sourceProvenance: {
      schemaVersion: 1,
      sourceStateKind: "dirty-worktree",
      worktreeDirty: true,
      baseCommit: "28cf62e000000000000000000000000000000000",
      sourceStateId: `dirty-sha256:${"b".repeat(64)}`,
      worktreeFingerprint: `sha256:${"b".repeat(64)}`,
      changedPathCount: 2,
      changedPaths: [
        { status: "M ", path: "mods/src/config.cc" },
        { status: "??", path: "mods/src/new-diagnostic.cc" },
      ],
      changedPathsTruncated: false,
      changedPathLimit: 64,
      ignoredPathsIncluded: false,
    },
    buildHash: "ARTIFACT-SHA256",
    deployedHash: "ARTIFACT-SHA256",
    hashMatch: true,
  };
  const payload = {
    ok: true,
    operation: "run",
    capability: {
      id: "global.stfc-mod-private.cycle",
      lifecycleState: "active",
    },
    data,
    meta: {
      capabilityId: "global.stfc-mod-private.cycle",
      adapterType: "cli",
    },
    ...workspaceMetadata,
  };

  for (const detail of ["compact", "standard", "diagnostic"]) {
    const projected = projectMcpResponse(payload, detail);
    assert.deepEqual(projected.data, data);
    assert.equal(projected.data.sourceProvenance.worktreeDirty, true);
    assert.equal(projected.data.buildHash, "ARTIFACT-SHA256");
    assert.equal(projected.data.deployedHash, "ARTIFACT-SHA256");
    assert.equal(projected.data.hashMatch, true);
  }
});

test("compact failures retain actionable errors without invocation traces", () => {
  const data = {
    error: {
      code: "PROVIDER_REJECTED",
      details: { retryable: false },
    },
  };
  const payload = {
    ok: false,
    operation: "run",
    capability: { id: "global.demo.run", lifecycleState: "active" },
    input: { path: ["demo", "run"] },
    args: {},
    data,
    error: { code: "EXECUTION_FAILED", message: "demo exited 2" },
    meta: { command: "demo", status: 2, cwd: repoRoot },
    ...workspaceMetadata,
  };

  const compact = projectMcpResponse(payload, "compact");
  const standard = projectMcpResponse(payload, "standard");
  const diagnostic = projectMcpResponse(payload, "diagnostic");

  assert.deepEqual(compact.error, payload.error);
  assert.deepEqual(compact.meta, { status: 2 });
  assert.equal(compact.data, data);
  assert.equal(standard.data, data);
  assert.equal(diagnostic.data, data);
  assert.equal("args" in compact, false);
  assert.equal("args" in standard, false);
});

test("compact is the agent-first default and materially reduces a run result", async () => {
  const input = {
    operation: "run",
    workspace: repoRoot,
    target: { id: "global.echo.say" },
    args: { message: "context budget" },
  };
  const compact = await performOperation(input);
  const diagnostic = await performOperation({
    ...input,
    responseDetail: "diagnostic",
  });

  assert.equal(compact.data, diagnostic.data);
  assert.equal("workspace" in compact, false);
  assert.ok(
    JSON.stringify(compact).length < JSON.stringify(diagnostic).length * 0.5,
  );
});

test("all profiles redact framework metadata without transforming capability data", () => {
  const secret = "swordfish-credential";
  const data = { password: secret, result: "provider-owned" };
  const payload = {
    ok: false,
    operation: "run",
    capability: { id: "global.demo.run", lifecycleState: "active" },
    input: { path: ["demo", "run"] },
    args: { password: secret, accessToken: secret },
    data,
    error: {
      code: "EXECUTION_FAILED",
      message: `provider rejected password ${secret}`,
    },
    meta: {
      command: "demo",
      args: ["--password", secret],
      authorization: `Bearer ${secret}`,
      connection: `postgres://worker:${secret}@localhost/axf`,
      providerEnvelope: { data: { password: secret } },
      status: 2,
    },
    ...workspaceMetadata,
  };

  for (const detail of ["compact", "standard", "diagnostic"]) {
    const projected = projectMcpResponse(payload, detail);
    const { data: projectedData, ...frameworkEnvelope } = projected;
    assert.equal(JSON.stringify(frameworkEnvelope).includes(secret), false);
    if (detail === "diagnostic") {
      assert.equal(projectedData, data);
      assert.equal(projected.args.password, "[REDACTED]");
      assert.equal(projected.meta.authorization, "[REDACTED]");
      assert.match(projected.meta.connection, /\[REDACTED\]/);
      assert.equal(
        projected.meta.providerEnvelope.data.password,
        "[REDACTED]",
      );
    }
  }

  assert.equal(data.password, secret);
});

test("redaction preserves sensitive argument schema declarations", () => {
  const payload = {
    ok: true,
    operation: "inspect",
    capability: {
      id: "global.demo.run",
      argsSchema: {
        type: "object",
        properties: {
          accessToken: {
            type: "string",
            description: "Provider token",
            example: "swordfish-credential",
          },
        },
      },
      defaults: { accessToken: "swordfish-credential" },
    },
  };

  const diagnostic = projectMcpResponse(payload, "diagnostic");

  assert.equal(
    diagnostic.capability.argsSchema.properties.accessToken.type,
    "string",
  );
  assert.equal(
    diagnostic.capability.argsSchema.properties.accessToken.description,
    "Provider token",
  );
  assert.equal(
    diagnostic.capability.argsSchema.properties.accessToken.example,
    "[REDACTED]",
  );
  assert.equal(diagnostic.capability.defaults.accessToken, "[REDACTED]");
});

test("invalid response detail fails closed with a schema-guided error", async () => {
  const result = await performOperation({
    operation: "list",
    workspace: repoRoot,
    responseDetail: "tiny",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_PARAMS");
  assert.match(result.error.message, /compact, standard, diagnostic/);
});


test("registryScope clarifies registry naming without claiming storage authority", () => {
  const capability = {
    id: "global.memory.remember",
    scope: "global",
    sideEffects: "write",
    lifecycleState: "active",
  };
  for (const detail of ["compact", "standard", "diagnostic"]) {
    const projected = projectMcpResponse({
      ok: true,
      operation: "inspect",
      capability,
      ...workspaceMetadata,
    }, detail);
    assert.equal(projected.capability.registryScope, "global");
    assert.equal(projected.capability.scope, "global");
    assert.equal(projected.capability.sideEffects, "write");
    assert.equal("storageScope" in projected.capability, false);
  }
  assert.equal("registryScope" in capability, false);
});

test("compact inspect retains safe launch identity and cwd without framework secrets", () => {
  const secret = "fixture-password-7291";
  const payload = {
    ok: true,
    operation: "inspect",
    capability: {
      id: "global.memory.remember",
      scope: "global",
      lifecycleState: "active",
      sideEffects: "write",
      defaults: { password: secret },
    },
    launchPlan: {
      command: "node",
      requestedCommand: "node",
      resolvedCommand: "/tools/node",
      commandSource: "path:/tools/node",
      launchStrategy: "direct",
      argsPrefix: ["memory.mjs", "remember", "--password", secret],
      cwd: repoRoot,
      cwdSource: "workspace",
      targetPath: "/tools/memory.mjs",
      targetSource: "relative:framework",
      env: { DATABASE_PASSWORD: secret },
      executionTarget: { env: { PASSWORD: secret } },
    },
    ...workspaceMetadata,
  };

  for (const detail of ["compact", "standard", "diagnostic"]) {
    const projected = projectMcpResponse(payload, detail);
    assert.equal(projected.launchPlan.command, "node");
    assert.equal(projected.launchPlan.cwd, repoRoot);
    assert.equal(projected.launchPlan.cwdSource, "workspace");
    assert.equal(projected.launchPlan.resolvedCommand, "/tools/node");
    assert.deepEqual(projected.launchPlan.argsPrefix, [
      "memory.mjs", "remember", "--password", "[REDACTED]",
    ]);
    assert.equal(JSON.stringify(projected).includes(secret), false);
    if (detail === "compact") {
      assert.equal("env" in projected.launchPlan, false);
      assert.equal("executionTarget" in projected.launchPlan, false);
    } else {
      assert.equal(projected.launchPlan.env, "[REDACTED]");
      assert.equal(projected.launchPlan.executionTarget.env, "[REDACTED]");
    }
  }
});

test("all successful run profiles retain provider-owned destination receipts unchanged", () => {
  const data = {
    status: "created",
    receipt: {
      destination: {
        schemaVersion: 1,
        identity: "verified-destination:fixture",
        backend: { verification: "verified", identity: "backend:fixture" },
        workspaceId: "workspace-fixture",
        authorityVersion: 7,
      },
      recordId: "record-fixture",
    },
  };
  const payload = {
    ok: true,
    operation: "run",
    capability: {
      id: "global.memory.remember",
      scope: "global",
      sideEffects: "write",
      lifecycleState: "active",
    },
    data,
    ...workspaceMetadata,
  };
  for (const detail of ["compact", "standard", "diagnostic"]) {
    const projected = projectMcpResponse(payload, detail);
    assert.equal(projected.data, data);
    assert.deepEqual(projected.data.receipt, data.receipt);
    assert.equal(projected.capability.registryScope, "global");
    assert.equal(projected.capability.sideEffects, "write");
  }
});


test("every inspect detail redacts credentials supplied only in launch arguments", () => {
  const secrets = ["fixture-only-paired-49", "fixture-only-equals-59"];
  const payload = {
    ok: true,
    operation: "inspect",
    capability: {
      id: "global.memory.remember",
      scope: "global",
      sideEffects: "write",
    },
    launchPlan: {
      command: "tool",
      argsPrefix: ["remember", "--password", secrets[0], `--client-secret=${secrets[1]}`],
      cwd: repoRoot,
    },
    ...workspaceMetadata,
  };
  for (const detail of ["compact", "standard", "diagnostic"]) {
    const projected = projectMcpResponse(payload, detail);
    assert.deepEqual(projected.launchPlan.argsPrefix, [
      "remember", "--password", "[REDACTED]", "--client-secret=[REDACTED]",
    ]);
    assert.equal(projected.launchPlan.cwd, repoRoot);
    for (const secret of secrets) {
      assert.equal(JSON.stringify(projected).includes(secret), false);
    }
  }
});
