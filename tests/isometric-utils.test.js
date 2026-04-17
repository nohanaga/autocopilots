const test = require("node:test");
const assert = require("node:assert/strict");
const { tileToScreen, screenToTile, clientToCanvasPoint } = require("../src/isometric-utils.js");

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
