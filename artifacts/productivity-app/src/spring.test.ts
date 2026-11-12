import assert from "node:assert/strict";
import { advanceSpring } from "./spring";
const exact = advanceSpring(1, 0, 0, 0.5);
for (const frames of [15, 30, 60]) {
  let state = { position: 1, velocity: 0 };
  for (let i = 0; i < frames; i++)
    state = advanceSpring(state.position, state.velocity, 0, 0.5 / frames);
  assert.ok(Math.abs(state.position - exact.position) < 1e-10);
  assert.ok(Math.abs(state.velocity - exact.velocity) < 1e-10);
}
assert.ok(
  exact.position > 0 && exact.position < 0.001,
  "Settles without overshoot despite delayed frames",
);
const travelling = advanceSpring(1, 0, 0, 0.06);
const reversed = advanceSpring(
  travelling.position,
  travelling.velocity,
  1,
  0.001,
);
assert.ok(
  reversed.position < travelling.position,
  "Retargeting carries incoming velocity instead of jumping",
);
const longFrame = advanceSpring(
  travelling.position,
  travelling.velocity,
  1,
  10,
);
assert.ok(
  Number.isFinite(longFrame.position) &&
    Math.abs(longFrame.position - 1) < 1e-8,
);
console.log(
  "PASS: frame-rate independent spring, velocity-preserving reversal and long-frame stability",
);
