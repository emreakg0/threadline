/** Exact critically damped integration: elapsed time, rather than frame count, sets the pace. */
export function advanceSpring(
  position: number,
  velocity: number,
  target: number,
  seconds: number,
) {
  const elapsed = Math.max(0, seconds);
  const frequency = Math.sqrt(420);
  const displacement = position - target;
  const coefficient = velocity + frequency * displacement;
  const decay = Math.exp(-frequency * elapsed);
  return {
    position: target + (displacement + coefficient * elapsed) * decay,
    velocity: (velocity - frequency * coefficient * elapsed) * decay,
  };
}
