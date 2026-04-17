(function (globalScope) {
  function tileToScreen(x, y, tileW, tileH, zoom, cameraX, cameraY) {
    const sx = ((x - y) * tileW * 0.5) * zoom + cameraX;
    const sy = ((x + y) * tileH * 0.5) * zoom + cameraY;
    return { x: sx, y: sy };
  }

  function screenToTile(sx, sy, tileW, tileH, zoom, cameraX, cameraY) {
    const x = (sx - cameraX) / zoom;
    const y = (sy - cameraY) / zoom;
    const tx = Math.floor((x / (tileW * 0.5) + y / (tileH * 0.5)) / 2 + 1e-6);
    const ty = Math.floor((y / (tileH * 0.5) - x / (tileW * 0.5)) / 2 + 1e-6);
    return { x: tx, y: ty };
  }

  function clientToCanvasPoint(clientX, clientY, rect, canvasWidth, canvasHeight) {
    const sx = (clientX - rect.left) * (canvasWidth / rect.width);
    const sy = (clientY - rect.top) * (canvasHeight / rect.height);
    return { x: sx, y: sy };
  }

  const api = {
    tileToScreen,
    screenToTile,
    clientToCanvasPoint,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.IsometricUtils = api;
})(typeof window !== "undefined" ? window : globalThis);
