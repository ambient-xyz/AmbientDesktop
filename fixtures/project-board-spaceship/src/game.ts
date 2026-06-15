export interface ShipState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  health: number;
}

export interface InputIntent {
  left?: boolean;
  right?: boolean;
  up?: boolean;
  down?: boolean;
}

export function createShip(): ShipState {
  return { x: 0, y: 0, vx: 0, vy: 0, health: 3 };
}

export function updateShip(ship: ShipState, input: InputIntent, dt: number): ShipState {
  const speed = 320;
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const nextX = clamp(ship.x + dx * speed * dt, -480, 480);
  const nextY = clamp(ship.y + dy * speed * dt, -270, 270);
  return { ...ship, x: nextX, y: nextY, vx: dx * speed, vy: dy * speed };
}

export function hasCollision(ship: ShipState, hazard: { x: number; y: number; radius: number }): boolean {
  const dx = ship.x - hazard.x;
  const dy = ship.y - hazard.y;
  return Math.sqrt(dx * dx + dy * dy) <= hazard.radius + 18;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
