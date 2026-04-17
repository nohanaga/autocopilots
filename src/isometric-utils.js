(function (globalScope) {
  function tileToScreen(x, y, tileW, tileH, zoom, cameraX, cameraY) {
    const sx = ((x - y) * tileW * 0.5) * zoom + cameraX;
    const sy = ((x + y) * tileH * 0.5) * zoom + cameraY;
    return { x: sx, y: sy };
  }

  function screenToTile(sx, sy, tileW, tileH, zoom, cameraX, cameraY) {
    const x = (sx - cameraX) / zoom;
    const y = (sy - cameraY) / zoom;
    // Slight epsilon avoids floating-point boundary drift that can shift exact tile centers by -1.
    const tx = Math.floor((x / (tileW * 0.5) + y / (tileH * 0.5)) / 2 + 1e-6);
    const ty = Math.floor((y / (tileH * 0.5) - x / (tileW * 0.5)) / 2 + 1e-6);
    return { x: tx, y: ty };
  }

  function clientToCanvasPoint(clientX, clientY, rect, canvasWidth, canvasHeight) {
    const sx = (clientX - rect.left) * (canvasWidth / rect.width);
    const sy = (clientY - rect.top) * (canvasHeight / rect.height);
    return { x: sx, y: sy };
  }

  function tileToScreenRotated(x, y, tileW, tileH, zoom, cameraX, cameraY, angle, mapSize) {
    const center = (mapSize - 1) / 2;
    const dx = x - center;
    const dy = y - center;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const rx = dx * cosA - dy * sinA + center;
    const ry = dx * sinA + dy * cosA + center;
    const sx = ((rx - ry) * tileW * 0.5) * zoom + cameraX;
    const sy = ((rx + ry) * tileH * 0.5) * zoom + cameraY;
    return { x: sx, y: sy };
  }

  function screenToTileRotated(sx, sy, tileW, tileH, zoom, cameraX, cameraY, angle, mapSize) {
    const center = (mapSize - 1) / 2;
    const px = (sx - cameraX) / zoom;
    const py = (sy - cameraY) / zoom;
    const rx = (px / (tileW * 0.5) + py / (tileH * 0.5)) / 2;
    const ry = (py / (tileH * 0.5) - px / (tileW * 0.5)) / 2;
    const dx = rx - center;
    const dy = ry - center;
    const cosA = Math.cos(-angle);
    const sinA = Math.sin(-angle);
    const tx = dx * cosA - dy * sinA + center;
    const ty = dx * sinA + dy * cosA + center;
    return { x: Math.floor(tx + 1e-6), y: Math.floor(ty + 1e-6) };
  }

  function tileDepthRotated(x, y, angle, mapSize) {
    const center = (mapSize - 1) / 2;
    const dx = x - center;
    const dy = y - center;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const rx = dx * cosA - dy * sinA;
    const ry = dx * sinA + dy * cosA;
    return rx + ry;
  }

  const api = {
    tileToScreen,
    screenToTile,
    clientToCanvasPoint,
    tileToScreenRotated,
    screenToTileRotated,
    tileDepthRotated,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.IsometricUtils = api;
})(typeof window !== "undefined" ? window : globalThis);
