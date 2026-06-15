import { describe, expect, it } from "vitest";
import { createShip, hasCollision, updateShip } from "../src/game";

describe("game state helpers", () => {
  it("moves the ship with keyboard intent", () => {
    const ship = updateShip(createShip(), { right: true, up: true }, 0.5);

    expect(ship.x).toBe(160);
    expect(ship.y).toBe(-160);
    expect(ship.vx).toBe(320);
    expect(ship.vy).toBe(-320);
  });

  it("clamps the ship to the play area", () => {
    let ship = createShip();
    for (let i = 0; i < 10; i += 1) ship = updateShip(ship, { right: true, down: true }, 1);

    expect(ship.x).toBe(480);
    expect(ship.y).toBe(270);
  });

  it("detects hazard collision", () => {
    expect(hasCollision(createShip(), { x: 5, y: 5, radius: 10 })).toBe(true);
    expect(hasCollision(createShip(), { x: 100, y: 100, radius: 10 })).toBe(false);
  });
});
