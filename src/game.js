(() => {
  const { createInitialState, placeStructure, removeStructure, simulateTick, nextRound, STRUCTURES } = window.GameLogic;

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
  const tileW = 64;
  const tileH = 32;
  const camera = { x: canvas.width / 2, y: 80, dragging: false, dragX: 0, dragY: 0 };

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

  function tileToScreen(x, y) {
    const sx = ((x - y) * tileW * 0.5) * zoom + camera.x;
    const sy = ((x + y) * tileH * 0.5) * zoom + camera.y;
    return { x: sx, y: sy };
  }

  function screenToTile(sx, sy) {
    const x = (sx - camera.x) / zoom;
    const y = (sy - camera.y) / zoom;
    const tx = Math.floor((x / (tileW * 0.5) + y / (tileH * 0.5)) / 2);
    const ty = Math.floor((y / (tileH * 0.5) - x / (tileW * 0.5)) / 2);
    return { x: tx, y: ty };
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

  function drawSprite(tile, sx, sy) {
    const scale = zoom;
    switch (tile.structure) {
      case "path":
        drawDiamond(sx, sy, "#949db4");
        break;
      case "ride":
        drawDiamond(sx, sy, "#f29259");
        ctx.fillStyle = "#ffe6d7";
        ctx.fillRect(sx - 10 * scale, sy - 30 * scale, 20 * scale, 15 * scale);
        ctx.beginPath();
        ctx.arc(sx, sy - 22 * scale, 10 * scale, 0, Math.PI * 2);
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        break;
      case "food":
        drawDiamond(sx, sy, "#57b8ff");
        ctx.fillStyle = "#fff4d0";
        ctx.fillRect(sx - 8 * scale, sy - 24 * scale, 16 * scale, 12 * scale);
        break;
      case "tree":
        drawDiamond(sx, sy, "#67bb7f");
        ctx.beginPath();
        ctx.fillStyle = "#2f8f49";
        ctx.arc(sx, sy - 20 * scale, 10 * scale, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "decor":
        drawDiamond(sx, sy, "#b08bff");
        ctx.fillStyle = "#d8c8ff";
        ctx.fillRect(sx - 3 * scale, sy - 20 * scale, 6 * scale, 14 * scale);
        break;
      case "building":
        drawDiamond(sx, sy, "#6f7ed8");
        ctx.fillStyle = "#d8e4ff";
        ctx.fillRect(sx - 9 * scale, sy - 28 * scale, 18 * scale, 18 * scale);
        break;
      default:
        break;
    }
  }

  function drawTerrain(tile, sx, sy) {
    if (tile.terrain === "water") {
      drawDiamond(sx, sy, "#2f5ea0");
      ctx.strokeStyle = "#7ad1ff77";
      ctx.beginPath();
      ctx.arc(sx, sy, 7 * zoom, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    drawDiamond(sx, sy, "#2f924f");
  }

  function drawVisitors() {
    state.visitors.forEach((v) => {
      const { x, y } = tileToScreen(v.x, v.y);
      ctx.fillStyle = `hsl(${Math.round(v.mood * 1.2)},75%,70%)`;
      ctx.beginPath();
      ctx.arc(x, y - 8 * zoom, 4 * zoom, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#11131b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        const tile = state.tiles[y][x];
        const p = tileToScreen(x, y);
        drawTerrain(tile, p.x, p.y);
        if (tile.structure) {
          drawSprite(tile, p.x, p.y);
        }
      }
    }

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
    const rect = canvas.getBoundingClientRect();
    const point = screenToTile(e.clientX - rect.left, e.clientY - rect.top);
    applyTool(point.x, point.y);
  });

  window.addEventListener("mouseup", () => {
    camera.dragging = false;
  });

  window.addEventListener("mousemove", (e) => {
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
  });

  document.getElementById("nextRound").addEventListener("click", () => {
    nextRound(state);
    refreshStats();
  });

  function loop() {
    simulateTick(state, 0.35);
    refreshStats();
    draw();
    requestAnimationFrame(loop);
  }

  buildToolButtons();
  refreshStats();
  loop();
})();
