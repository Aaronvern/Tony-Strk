import { test } from "node:test";
import assert from "node:assert/strict";

// Guards the test glob: `node --test tests/` treats the path as a module and
// fails, and an unscoped `node --test` walks into vendor/ and runs the
// upstream SDK's TypeScript suite. This file must be discovered.
test("nested tests are discovered", () => assert.ok(true));
