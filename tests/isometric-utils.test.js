const test = require("node:test");
const assert = require("node:assert/strict");
const { tileToScreen, screenToTile, clientToCanvasPoint, tileToScreenRotated, screenToTileRotated } = require("../src/isometric-utils.js");

test("tileToScreen and screenToTile stay aligned across zoom and camera", () => {
  const tileW = 64;
  const tileH = 32;
  const zoom = 1.35;
  const cameraX = 420;
  const cameraY = 90;
  const tile = { x: 7, y: 11 };

  const screen = tileToScreen(tile.x, tile.y, tileW, tileH, zoom, cameraX, cameraY);
  const result = screenToTile(screen.x, screen.y, tileW, tileH, zoom, cameraX, cameraY);

  assert.deepEqual(result, tile);
});

test("clientToCanvasPoint compensates for CSS-scaled canvas", () => {
  const rect = { left: 50, top: 20, width: 640, height: 400 };
  const point = clientToCanvasPoint(370, 220, rect, 1280, 800);

  assert.equal(point.x, 640);
  assert.equal(point.y, 400);
});

test("rotated tileToScreen and screenToTile round-trip at 90-degree increments", () => {
  const tileW = 64;
  const tileH = 32;
  const zoom = 1.2;
  const cameraX = 400;
  const cameraY = 100;
  const mapSize = 26;
  const tile = { x: 5, y: 13 };

  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const screen = tileToScreenRotated(tile.x, tile.y, tileW, tileH, zoom, cameraX, cameraY, angle, mapSize);
    const result = screenToTileRotated(screen.x, screen.y, tileW, tileH, zoom, cameraX, cameraY, angle, mapSize);
    assert.deepEqual(result, tile, `round-trip failed at angle ${angle}`);
  }
});

test("rotated projection at angle 0 matches standard projection", () => {
  const tileW = 64;
  const tileH = 32;
  const zoom = 1;
  const cameraX = 640;
  const cameraY = 80;
  const mapSize = 26;
  const tile = { x: 10, y: 8 };

  const standard = tileToScreen(tile.x, tile.y, tileW, tileH, zoom, cameraX, cameraY);
  const rotated = tileToScreenRotated(tile.x, tile.y, tileW, tileH, zoom, cameraX, cameraY, 0, mapSize);

  assert.ok(Math.abs(standard.x - rotated.x) < 1e-6, "x mismatch at angle 0");
  assert.ok(Math.abs(standard.y - rotated.y) < 1e-6, "y mismatch at angle 0");
});
