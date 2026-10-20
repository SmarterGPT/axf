import test from "node:test";
import assert from "node:assert/strict";
import { redactMcpResponse } from "../src/mcp/redaction.js";

test("redacts connection-string passwords without a structured secret field", () => {
  const projected = {
    ok: false,
    operation: "doctor",
    meta: {
      detail: "Host=db;Password=pw;Username=agent",
    },
  };

  const redacted = redactMcpResponse(projected);

  assert.equal(
    redacted.meta.detail,
    "Host=db;Password=[REDACTED];Username=agent",
  );
});

test("redacts quoted connection-string passwords as one value", () => {
  const projected = {
    ok: false,
    operation: "doctor",
    meta: {
      detail: 'Host=db;Password="short phrase";Username=agent',
    },
  };

  const redacted = redactMcpResponse(projected);

  assert.equal(
    redacted.meta.detail,
    "Host=db;Password=[REDACTED];Username=agent",
  );
});

for (const { label, input, expected } of [
  {
    label: "password JSON members",
    input: 'provider failed: {"password":"hunter2"}',
    expected: 'provider failed: {"password":"[REDACTED]"}',
  },
  {
    label: "secret access key JSON members",
    input: '{"secretAccessKey":"cloud-secret"}',
    expected: '{"secretAccessKey":"[REDACTED]"}',
  },
  {
    label: "API key headers",
    input: "X-API-Key: abc123",
    expected: "X-API-Key: [REDACTED]",
  },
  {
    label: "credential headers in multiline excerpts",
    input: "provider response\nAuthorization: Custom abc123\nstatus: denied",
    expected:
      "provider response\nAuthorization: [REDACTED]\nstatus: denied",
  },
]) {
  test(`redacts embedded ${label} without a structured secret field`, () => {
    const projected = {
      ok: false,
      operation: "run",
      error: { message: input },
    };

    const redacted = redactMcpResponse(projected);

    assert.equal(redacted.error.message, expected);
  });
}

test("does not treat ordinary colon-delimited prose as a secret", () => {
  const message = "provider rejected request: password: required; token: missing";

  const redacted = redactMcpResponse({
    ok: false,
    operation: "run",
    error: { message },
  });

  assert.equal(redacted.error.message, message);
});

test("preserves embedded secrets in capability-owned top-level data", () => {
  const data = {
    message: 'provider failed: {"password":"hunter2"}',
    headers: "X-API-Key: abc123",
  };

  const redacted = redactMcpResponse({
    ok: false,
    operation: "run",
    data,
    error: { message: data.message },
  });

  assert.equal(redacted.data, data);
  assert.equal(
    redacted.error.message,
    'provider failed: {"password":"[REDACTED]"}',
  );
});

for (const { field, secret } of [
  { field: "secretAccessKey", secret: "xy" },
  { field: "passphrase", secret: "q" },
  { field: "connection", secret: "db" },
  { field: "pwd", secret: "abc" },
]) {
  test(`redacts and propagates short ${field} values`, () => {
    const projected = {
      ok: false,
      operation: "run",
      args: { [field]: secret },
      meta: {
        argv: [`--${field}`, secret],
        message: `provider rejected value ${secret}`,
      },
    };

    const redacted = redactMcpResponse(projected);

    assert.equal(redacted.args[field], "[REDACTED]");
    assert.equal(redacted.meta.argv[1], "[REDACTED]");
    assert.equal(
      redacted.meta.message,
      "provider rejected value [REDACTED]",
    );
  });
}


for (const { flag, secret } of [
  { flag: "--password", secret: "fixture-only-password-49" },
  { flag: "--client-secret", secret: "fixture-only-client-59" },
  { flag: "--connection-string", secret: "fixture-only-dsn-69" },
  { flag: "--accessToken", secret: "fixture-only-token-79" },
  { flag: "-Password", secret: "fixture-only-powershell-89" },
]) {
  for (const inline of [false, true]) {
    test(`redacts standalone argv ${flag} ${inline ? "equals" : "paired"} credentials`, () => {
      const args = inline ? [`${flag}=${secret}`] : [flag, secret];
      const projected = {
        launchPlan: { argsPrefix: args },
        meta: {
          args,
          argv: args,
          message: `provider rejected ${secret}`,
        },
        capability: { executionTarget: { args } },
      };
      const redacted = redactMcpResponse(projected);
      const expected = inline ? [`${flag}=[REDACTED]`] : [flag, "[REDACTED]"];
      assert.deepEqual(redacted.launchPlan.argsPrefix, expected);
      assert.deepEqual(redacted.meta.args, expected);
      assert.deepEqual(redacted.meta.argv, expected);
      assert.deepEqual(redacted.capability.executionTarget.args, expected);
      assert.equal(redacted.meta.message, "provider rejected [REDACTED]");
      assert.equal(JSON.stringify(redacted).includes(secret), false);
      assert.deepEqual(projected.launchPlan.argsPrefix, args);
    });
  }
}

test("argv redaction does not infer unknown short aliases or flags after --", () => {
  const args = ["-p", "ordinary-value", "--", "--password", "positional-value"];
  const data = { argsPrefix: ["--password", "provider-owned-value"] };
  const projected = {
    launchPlan: { argsPrefix: args },
    labels: ["--password", "ordinary-label"],
    data,
  };
  const redacted = redactMcpResponse(projected);
  assert.deepEqual(redacted.launchPlan.argsPrefix, args);
  assert.deepEqual(redacted.labels, projected.labels);
  assert.equal(redacted.data, data);
});


test("argv redaction still scans a sensitive flag adjacent to another sensitive flag", () => {
  const secret = "fixture-only-adjacent-49";
  const projected = {
    launchPlan: { argsPrefix: ["--password", "--accessToken", secret] },
  };
  const redacted = redactMcpResponse(projected);
  assert.equal(JSON.stringify(redacted).includes(secret), false);
  assert.equal(redacted.launchPlan.argsPrefix[2], "[REDACTED]");
});

test("argv -- sentinel immediately after a sensitive flag ends option interpretation", () => {
  const args = ["--password", "--", "--accessToken", "positional-value"];
  const redacted = redactMcpResponse({ launchPlan: { argsPrefix: args } });
  assert.deepEqual(redacted.launchPlan.argsPrefix, args);
});
