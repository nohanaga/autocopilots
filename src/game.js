(() => {
  const { createInitialState, placeStructure, removeStructure, simulateTick, nextRound, STRUCTURES } = window.GameLogic;
  const { tileToScreen, screenToTile, clientToCanvasPoint, tileToScreenRotated, screenToTileRotated, tileDepthRotated } = window.IsometricUtils;

  const toolDefs = [
    { id: "path", name: "通路", desc: `¥${STRUCTURES.path.cost}` },
    { id: "ride", name: "アトラクション", desc: `¥${STRUCTURES.ride.cost}` },
    { id: "food", name: "フード", desc: `¥${STRUCTURES.food.cost}` },
    { id: "tree", name: "木", desc: `¥${STRUCTURES.tree.cost}` },
    { id: "decor", name: "装飾", desc: `¥${STRUCTURES.decor.cost}` },
    { id: "building", name: "建物", desc: `¥${STRUCTURES.building.cost}` },
    { id: "water", name: "水面", desc: `¥${STRUCTURES.water.cost}` },
    { id: "remove", name: "撤去", desc: "返金 40%" },
  ];

  const state = createInitialState(26);
  const canvas = document.getElementById("parkCanvas");
  const ctx = canvas.getContext("2d");
  // Crisp pixel-art rendering: no antialiasing on canvas drawing
  ctx.imageSmoothingEnabled = false;
  const toolsEl = document.getElementById("tools");

  const stats = {
    round: document.getElementById("round"),
    funds: document.getElementById("funds"),
    visitors: document.getElementById("visitors"),
    cleanliness: document.getElementById("cleanliness"),
    queue: document.getElementById("queue"),
    satisfaction: document.getElementById("satisfaction"),
  };

  let selectedTool = "path";
  let zoom = 1;
  let rotationAngle = 0;
  let targetRotation = 0;
  const ROTATION_SPEED = 0.08;
  const SIMULATION_TICK_DELTA = 0.35;
  const tileW = 64;
  const tileH = 32;
  const MIN_TILE_DEPTH = 6;
  const BASE_TILE_DEPTH = 10;
  const camera = { x: canvas.width / 2, y: 80, dragging: false, dragX: 0, dragY: 0 };
  const hoveredTile = { x: -1, y: -1 };

  function refreshStats() {
    stats.round.textContent = String(state.round);
    stats.funds.textContent = `¥${Math.floor(state.funds).toLocaleString("ja-JP")}`;
    stats.visitors.textContent = `${state.visitors.length}`;
    stats.cleanliness.textContent = `${Math.round(state.cleanliness)}%`;
    stats.queue.textContent = `${state.averageQueue.toFixed(1)}`;
    stats.satisfaction.textContent = `${Math.round(state.satisfaction)}%`;
  }

  function buildToolButtons() {
    toolsEl.innerHTML = "";
    toolDefs.forEach((tool) => {
      const btn = document.createElement("button");
      btn.className = `tool ${tool.id === selectedTool ? "active" : ""}`;
      btn.innerHTML = `<strong>${tool.name}</strong><small>${tool.desc}</small>`;
      btn.addEventListener("click", () => {
        selectedTool = tool.id;
        buildToolButtons();
      });
      toolsEl.appendChild(btn);
    });
  }

  function worldToScreen(x, y) {
    return tileToScreenRotated(x, y, tileW, tileH, zoom, camera.x, camera.y, rotationAngle, state.size);
  }

  function screenToWorld(sx, sy) {
    return screenToTileRotated(sx, sy, tileW, tileH, zoom, camera.x, camera.y, rotationAngle, state.size);
  }

  function clientToScreen(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return clientToCanvasPoint(clientX, clientY, rect, canvas.width, canvas.height);
  }

  function drawDiamond(x, y, fill, stroke = "#00000020") {
    ctx.beginPath();
    ctx.moveTo(x, y - tileH * 0.5 * zoom);
    ctx.lineTo(x + tileW * 0.5 * zoom, y);
    ctx.lineTo(x, y + tileH * 0.5 * zoom);
    ctx.lineTo(x - tileW * 0.5 * zoom, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  function drawExtrudedDiamond(x, y, topFill, sideLeft, sideRight, depth, stroke = "#00000020") {
    const halfW = tileW * 0.5 * zoom;
    const halfH = tileH * 0.5 * zoom;
    const rightX = x + halfW;
    const leftX = x - halfW;
    const bottomY = y + halfH;
    const downY = bottomY + depth;

    ctx.beginPath();
    ctx.moveTo(rightX, y);
    ctx.lineTo(x, bottomY);
    ctx.lineTo(x, downY);
    ctx.lineTo(rightX, y + depth);
    ctx.closePath();
    ctx.fillStyle = sideRight;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(leftX, y);
    ctx.lineTo(x, bottomY);
    ctx.lineTo(x, downY);
    ctx.lineTo(leftX, y + depth);
    ctx.closePath();
    ctx.fillStyle = sideLeft;
    ctx.fill();

    drawDiamond(x, y, topFill, stroke);

    ctx.strokeStyle = "#0000001f";
    ctx.beginPath();
    ctx.moveTo(leftX, y);
    ctx.lineTo(leftX, y + depth);
    ctx.moveTo(rightX, y);
    ctx.lineTo(rightX, y + depth);
    ctx.moveTo(x, bottomY);
    ctx.lineTo(x, downY);
    ctx.stroke();
  }

  // Pixel-art "px" helper: draws one pixel rectangle at integer coords
  function px(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }

  // Large primes used for stable spatial hashing of tile decorations
  // (so grass tufts/flowers appear in deterministic positions).
  const GRASS_HASH_PRIME_X = 73856093;
  const GRASS_HASH_PRIME_Y = 19349663;

  function drawSprite(tile, sx, sy) {
    const scale = zoom;
    const u = Math.max(1, Math.round(2 * scale)); // base pixel unit

    switch (tile.structure) {
      case "path": {
        // Cream cobblestone tile
        drawDiamond(sx, sy, "#f3e1c0", "#a07a4a");
        ctx.fillStyle = "#c9a574";
        for (let i = -1; i <= 1; i += 1) {
          for (let j = -1; j <= 1; j += 1) {
            if ((i + j) % 2 === 0) {
              ctx.fillRect(sx + i * 6 * scale - 1, sy + j * 3 * scale - 1, 2, 2);
            }
          }
        }
        break;
      }
      case "ride": {
        // Cute circus tent: pink/white striped roof, yellow flag
        drawDiamond(sx, sy, "#ffd1e1", "#a8456f");
        const tentW = 22 * scale;
        const tentH = 16 * scale;
        const baseY = sy - 4 * scale;
        // body (white)
        px(sx - tentW / 2, baseY - tentH, tentW, tentH, "#fff5fa");
        // pink stripes
        for (let i = 0; i < 4; i += 1) {
          px(sx - tentW / 2 + i * 6 * scale, baseY - tentH, 3 * scale, tentH, "#ff7ab6");
        }
        // roof triangle (pixel-style stepped)
        const peakY = baseY - tentH - 10 * scale;
        for (let i = 0; i < 5; i += 1) {
          const w = tentW - i * 4 * scale;
          px(sx - w / 2, baseY - tentH - i * 2 * scale, w, 2 * scale, i % 2 === 0 ? "#ff7ab6" : "#fff5fa");
        }
        // flag pole + flag
        px(sx - u / 2, peakY, u, 8 * scale, "#5a3a2a");
        px(sx + u / 2, peakY, 6 * scale, 4 * scale, "#ffd447");
        // outline
        ctx.strokeStyle = "#2b2545";
        ctx.lineWidth = Math.max(1, scale);
        ctx.strokeRect(Math.round(sx - tentW / 2), Math.round(baseY - tentH), Math.round(tentW), Math.round(tentH));
        break;
      }
      case "food": {
        // Food cart: red base, striped awning, window
        drawDiamond(sx, sy, "#ffe4c2", "#c46a1f");
        const cartW = 22 * scale;
        const cartH = 12 * scale;
        const baseY = sy - 4 * scale;
        // cart body
        px(sx - cartW / 2, baseY - cartH, cartW, cartH, "#ffeac2");
        // counter
        px(sx - cartW / 2, baseY - 4 * scale, cartW, 4 * scale, "#d97a3c");
        // awning (striped)
        const awY = baseY - cartH - 6 * scale;
        for (let i = 0; i < 6; i += 1) {
          px(sx - cartW / 2 + i * 4 * scale, awY, 4 * scale, 6 * scale, i % 2 === 0 ? "#ff5d6c" : "#fff5fa");
        }
        // wheels
        px(sx - cartW / 2 + 2 * scale, baseY, 4 * scale, 4 * scale, "#2b2545");
        px(sx + cartW / 2 - 6 * scale, baseY, 4 * scale, 4 * scale, "#2b2545");
        // outline
        ctx.strokeStyle = "#2b2545";
        ctx.lineWidth = Math.max(1, scale);
        ctx.strokeRect(Math.round(sx - cartW / 2), Math.round(baseY - cartH), Math.round(cartW), Math.round(cartH));
        break;
      }
      case "tree": {
        // Pixel pine tree with brown trunk
        drawDiamond(sx, sy, "#a9e1a4", "#3f8a52");
        // trunk
        px(sx - u, sy - 6 * scale, u * 2, 8 * scale, "#7a4a2a");
        // foliage layers (pixelated triangles)
        const greens = ["#3f8a52", "#4ea862", "#6cc47a"];
        for (let i = 0; i < 3; i += 1) {
          const w = (14 - i * 4) * scale;
          const y = sy - (12 + i * 6) * scale;
          px(sx - w / 2, y, w, 4 * scale, greens[i]);
        }
        // little highlight
        px(sx - 2 * scale, sy - 22 * scale, 2 * scale, 2 * scale, "#d6f5cf");
        break;
      }
      case "decor": {
        // Cute flower
        drawDiamond(sx, sy, "#f6e3ff", "#7b4ea8");
        const cy = sy - 12 * scale;
        // stem
        px(sx - u / 2, sy - 8 * scale, u, 8 * scale, "#3f8a52");
        // petals
        const petal = "#ff7ab6";
        px(sx - 3 * scale, cy - 3 * scale, 6 * scale, 3 * scale, petal);
        px(sx - 3 * scale, cy + 3 * scale, 6 * scale, 3 * scale, petal);
        px(sx - 6 * scale, cy, 3 * scale, 3 * scale, petal);
        px(sx + 3 * scale, cy, 3 * scale, 3 * scale, petal);
        // center
        px(sx - 1.5 * scale, cy, 3 * scale, 3 * scale, "#ffd447");
        break;
      }
      case "building": {
        // Cute pixel house with red roof and yellow window
        drawDiamond(sx, sy, "#e6ddff", "#5a4ea8");
        const bw = 22 * scale;
        const bh = 16 * scale;
        const baseY = sy - 4 * scale;
        // walls (cream)
        px(sx - bw / 2, baseY - bh, bw, bh, "#fff1d6");
        // wall outline
        ctx.strokeStyle = "#2b2545";
        ctx.lineWidth = Math.max(1, scale);
        ctx.strokeRect(Math.round(sx - bw / 2), Math.round(baseY - bh), Math.round(bw), Math.round(bh));
        // door
        px(sx - 3 * scale, baseY - 8 * scale, 6 * scale, 8 * scale, "#7a4a2a");
        px(sx + 1 * scale, baseY - 4 * scale, 1 * scale, 1 * scale, "#ffd447");
        // window
        px(sx - bw / 2 + 3 * scale, baseY - bh + 4 * scale, 5 * scale, 5 * scale, "#8ab6ff");
        // roof (red, stepped)
        for (let i = 0; i < 5; i += 1) {
          const w = bw + 4 * scale - i * 4 * scale;
          px(sx - w / 2, baseY - bh - (i + 1) * 2 * scale, w, 2 * scale, i % 2 === 0 ? "#ff5d6c" : "#e0455a");
        }
        // chimney
        px(sx + bw / 2 - 6 * scale, baseY - bh - 10 * scale, 4 * scale, 6 * scale, "#7a4a2a");
        break;
      }
      default:
        break;
    }
  }

  function drawTerrain(tile, sx, sy) {
    const depth = Math.max(MIN_TILE_DEPTH, BASE_TILE_DEPTH * zoom);
    if (tile.terrain === "water") {
      drawExtrudedDiamond(sx, sy, "#7ec9ff", "#3f8ad6", "#5aa6e8", depth, "#2b254588");
      // sparkle pixels
      ctx.fillStyle = "#ffffffcc";
      ctx.fillRect(Math.round(sx - 6 * zoom), Math.round(sy - 1), Math.max(1, Math.round(2 * zoom)), Math.max(1, Math.round(2 * zoom)));
      ctx.fillRect(Math.round(sx + 4 * zoom), Math.round(sy + 3 * zoom), Math.max(1, Math.round(2 * zoom)), Math.max(1, Math.round(2 * zoom)));
      return;
    }
    // Cute pastel grass
    drawExtrudedDiamond(sx, sy, "#a9e1a4", "#4ea862", "#62bd72", depth, "#2b254566");
    // tiny grass tuft pixels (deterministic based on tile coords would be ideal,
    // but we only have screen coords here; use a stable hash via sx+sy)
    const h = (Math.round(sx) * GRASS_HASH_PRIME_X) ^ (Math.round(sy) * GRASS_HASH_PRIME_Y);
    if ((h & 7) === 0) {
      ctx.fillStyle = "#3f8a52";
      ctx.fillRect(Math.round(sx - 4 * zoom), Math.round(sy + 2 * zoom), Math.max(1, Math.round(zoom)), Math.max(1, Math.round(2 * zoom)));
    }
    if ((h & 15) === 1) {
      ctx.fillStyle = "#fff5fa";
      ctx.fillRect(Math.round(sx + 5 * zoom), Math.round(sy - 1 * zoom), Math.max(1, Math.round(2 * zoom)), Math.max(1, Math.round(2 * zoom)));
    }
  }

  function drawHoverTile() {
    if (
      hoveredTile.x < 0 || hoveredTile.y < 0
      || hoveredTile.x >= state.size || hoveredTile.y >= state.size
    ) {
      return;
    }
    const { x, y } = worldToScreen(hoveredTile.x, hoveredTile.y);
    const halfW = tileW * 0.5 * zoom;
    const halfH = tileH * 0.5 * zoom;
    ctx.save();
    ctx.strokeStyle = "#ff7ab6";
    ctx.lineWidth = Math.max(2, 2 * zoom);
    ctx.setLineDash([Math.max(2, 4 * zoom), Math.max(2, 3 * zoom)]);
    ctx.beginPath();
    ctx.moveTo(x, y - halfH);
    ctx.lineTo(x + halfW, y);
    ctx.lineTo(x, y + halfH);
    ctx.lineTo(x - halfW, y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    // pixel crosshair
    ctx.fillStyle = "#ff7ab6";
    ctx.fillRect(Math.round(x - 1), Math.round(y - 5 * zoom), 2, Math.max(1, Math.round(3 * zoom)));
    ctx.fillRect(Math.round(x - 1), Math.round(y + 2 * zoom), 2, Math.max(1, Math.round(3 * zoom)));
    ctx.fillRect(Math.round(x - 5 * zoom), Math.round(y - 1), Math.max(1, Math.round(3 * zoom)), 2);
    ctx.fillRect(Math.round(x + 2 * zoom), Math.round(y - 1), Math.max(1, Math.round(3 * zoom)), 2);
  }

  function drawVisitors() {
    state.visitors.forEach((v) => {
      const { x, y } = worldToScreen(v.x, v.y);
      // tiny pixel person: head + body, color reflects mood
      const bodyColor = `hsl(${Math.round(v.mood * 1.2)},75%,60%)`;
      const headColor = "#ffe0c2";
      const u = Math.max(1, Math.round(zoom));
      const baseY = Math.round(y - 2 * zoom);
      // body
      ctx.fillStyle = bodyColor;
      ctx.fillRect(Math.round(x - 2 * zoom), baseY - 4 * u, 4 * u, 4 * u);
      // head
      ctx.fillStyle = headColor;
      ctx.fillRect(Math.round(x - 2 * zoom), baseY - 8 * u, 4 * u, 4 * u);
      // outline
      ctx.fillStyle = "#2b2545";
      ctx.fillRect(Math.round(x - 2 * zoom) - 1, baseY - 8 * u - 1, 1, 8 * u + 2);
      ctx.fillRect(Math.round(x - 2 * zoom) + 4 * u, baseY - 8 * u - 1, 1, 8 * u + 2);
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Pastel sky → soft horizon background (cute pixel-art feel)
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, "#cfeeff");
    bg.addColorStop(0.6, "#ffe6f0");
    bg.addColorStop(1, "#fff5b8");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tilesToDraw = [];
    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        tilesToDraw.push({
          x,
          y,
          depth: tileDepthRotated(x, y, rotationAngle, state.size),
        });
      }
    }
    tilesToDraw.sort((a, b) => a.depth - b.depth);

    for (const t of tilesToDraw) {
      const tile = state.tiles[t.y][t.x];
      const p = worldToScreen(t.x, t.y);
      drawTerrain(tile, p.x, p.y);
      if (tile.structure) {
        drawSprite(tile, p.x, p.y);
      }
    }

    drawHoverTile();
    drawVisitors();
  }

  function applyTool(tileX, tileY) {
    if (tileX < 0 || tileY < 0 || tileX >= state.size || tileY >= state.size) {
      return;
    }
    if (selectedTool === "remove") {
      removeStructure(state, tileX, tileY);
    } else {
      placeStructure(state, tileX, tileY, selectedTool);
    }
  }

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) {
      camera.dragging = true;
      camera.dragX = e.clientX;
      camera.dragY = e.clientY;
      return;
    }
    const mouse = clientToScreen(e.clientX, e.clientY);
    const point = screenToWorld(mouse.x, mouse.y);
    applyTool(point.x, point.y);
  });

  window.addEventListener("mouseup", () => {
    camera.dragging = false;
  });

  window.addEventListener("mousemove", (e) => {
    const mouse = clientToScreen(e.clientX, e.clientY);
    const tile = screenToWorld(mouse.x, mouse.y);
    hoveredTile.x = tile.x;
    hoveredTile.y = tile.y;

    if (!camera.dragging) {
      return;
    }
    const dx = e.clientX - camera.dragX;
    const dy = e.clientY - camera.dragY;
    camera.x += dx;
    camera.y += dy;
    camera.dragX = e.clientX;
    camera.dragY = e.clientY;
  });

  window.addEventListener("wheel", (e) => {
    zoom += e.deltaY < 0 ? 0.06 : -0.06;
    zoom = Math.max(0.5, Math.min(1.8, zoom));
  });

  window.addEventListener("keydown", (e) => {
    const step = 25;
    if (e.key === "w" || e.key === "ArrowUp") camera.y += step;
    if (e.key === "s" || e.key === "ArrowDown") camera.y -= step;
    if (e.key === "a" || e.key === "ArrowLeft") camera.x += step;
    if (e.key === "d" || e.key === "ArrowRight") camera.x -= step;
    if (e.key === "q" || e.key === "Q") targetRotation -= Math.PI / 2;
    if (e.key === "e" || e.key === "E") targetRotation += Math.PI / 2;
  });

  document.getElementById("nextRound").addEventListener("click", () => {
    nextRound(state);
    refreshStats();
  });

  document.getElementById("rotateLeft").addEventListener("click", () => {
    targetRotation -= Math.PI / 2;
  });
  document.getElementById("rotateRight").addEventListener("click", () => {
    targetRotation += Math.PI / 2;
  });

  function loop() {
    const diff = targetRotation - rotationAngle;
    if (Math.abs(diff) > 0.001) {
      rotationAngle += diff * ROTATION_SPEED;
    } else {
      rotationAngle = targetRotation;
    }

    simulateTick(state, SIMULATION_TICK_DELTA);
    refreshStats();
    draw();
    requestAnimationFrame(loop);
  }

  buildToolButtons();
  refreshStats();
  loop();
})();
