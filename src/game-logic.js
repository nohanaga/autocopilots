(function initGameLogic(globalScope) {
  const STRUCTURES = {
    path: { cost: 15 },
    ride: { cost: 620 },
    tree: { cost: 30 },
    water: { cost: 24 },
    food: { cost: 180 },
    decor: { cost: 75 },
    building: { cost: 340 },
  };
  const VISITOR_SPAWN_INTERVAL = 2.4;
  const RIDE_CYCLE_DURATION = 6;
  const RIDE_CAPACITY_PER_CYCLE = 6;
  const MAX_VISITORS = 140;
  const ENTRANCE_X = 2;
  const ENTRANCE_Y = 2;
  const ROUND_SATISFACTION_BONUS_MULTIPLIER = 14;
  const ROUND_VISITOR_BONUS_MULTIPLIER = 4;
  const INITIAL_MOOD_BASE = 55;
  const INITIAL_MOOD_VARIANCE = 18;
  const BUILDING_MAINTENANCE_COST = 0.4;
  const BUILDING_CLEANLINESS_BONUS = 0.06;
  const DECOR_CLEANLINESS_BONUS = 0.03;
  const VISITOR_CLEANLINESS_PENALTY = 0.04;
  const FOOD_CLEANLINESS_PENALTY = 0.03;
  const SATISFACTION_MOOD_WEIGHT = 0.55;
  const SATISFACTION_CLEANLINESS_WEIGHT = 0.45;
  const SATISFACTION_QUEUE_PENALTY = 0.8;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createTile(terrain = "grass") {
    return { terrain, structure: null };
  }

  function createInitialState(size = 24) {
    const tiles = Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => {
        let terrain = "grass";
        if ((x > size - 8 && y < 6) || (x > size - 6 && y > size - 7)) {
          terrain = "water";
        }
        return createTile(terrain);
      })
    );

    const state = {
      size,
      tiles,
      visitors: [],
      rides: {},
      spawnTimer: 0,
      nextRideId: 1,
      round: 1,
      funds: 12000,
      cleanliness: 84,
      satisfaction: 68,
      servedVisitors: 0,
      averageQueue: 0,
    };

    placeStructure(state, ENTRANCE_X, ENTRANCE_Y, "path");
    placeStructure(state, ENTRANCE_X + 1, ENTRANCE_Y, "path");
    placeStructure(state, ENTRANCE_X + 2, ENTRANCE_Y, "path");

    return state;
  }

  function inBounds(state, x, y) {
    return x >= 0 && y >= 0 && x < state.size && y < state.size;
  }

  function getTile(state, x, y) {
    if (!inBounds(state, x, y)) {
      return null;
    }
    return state.tiles[y][x];
  }

  function neighbors(state, x, y) {
    const points = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    return points.filter(([nx, ny]) => inBounds(state, nx, ny));
  }

  function isWalkable(tile) {
    return tile && tile.structure === "path";
  }

  function hasAdjacentPath(state, x, y) {
    return neighbors(state, x, y).some(([nx, ny]) => isWalkable(getTile(state, nx, ny)));
  }

  function placeStructure(state, x, y, type) {
    const tile = getTile(state, x, y);
    const data = STRUCTURES[type];
    if (!tile || !data || state.funds < data.cost) {
      return false;
    }
    if (type === "water") {
      if (tile.structure) {
        return false;
      }
      tile.terrain = tile.terrain === "water" ? "grass" : "water";
      state.funds -= data.cost;
      return true;
    }

    if (tile.terrain === "water" || tile.structure) {
      return false;
    }

    if (type !== "path" && !hasAdjacentPath(state, x, y)) {
      return false;
    }

    tile.structure = type;
    state.funds -= data.cost;

    if (type === "ride") {
      const rideId = `ride-${state.nextRideId++}`;
      tile.rideId = rideId;
      state.rides[rideId] = { id: rideId, x, y, queue: 0, cycleTimer: 0, status: "運行中" };
    }

    return true;
  }

  function removeStructure(state, x, y) {
    const tile = getTile(state, x, y);
    if (!tile || !tile.structure) {
      return false;
    }

    const type = tile.structure;
    const refund = Math.floor((STRUCTURES[type]?.cost || 0) * 0.4);
    state.funds += refund;

    if (tile.rideId) {
      delete state.rides[tile.rideId];
      delete tile.rideId;
    }

    tile.structure = null;
    return true;
  }

  function findReachablePaths(state) {
    const visited = new Set();
    const queue = [[ENTRANCE_X, ENTRANCE_Y]];

    while (queue.length) {
      const [x, y] = queue.shift();
      const key = `${x},${y}`;
      if (visited.has(key)) {
        continue;
      }
      const tile = getTile(state, x, y);
      if (!isWalkable(tile)) {
        continue;
      }
      visited.add(key);
      neighbors(state, x, y).forEach(([nx, ny]) => {
        const nextKey = `${nx},${ny}`;
        if (!visited.has(nextKey)) {
          queue.push([nx, ny]);
        }
      });
    }

    return [...visited].map((key) => key.split(",").map(Number));
  }

  function pickVisitorTarget(state, randomFn) {
    const reachablePaths = findReachablePaths(state);
    if (!reachablePaths.length) {
      return null;
    }

    const candidates = reachablePaths.filter(([x, y]) => {
      return neighbors(state, x, y).some(([nx, ny]) => {
        const t = getTile(state, nx, ny);
        return t && ["ride", "food", "tree", "decor", "building"].includes(t.structure);
      });
    });

    const source = candidates.length ? candidates : reachablePaths;
    const index = Math.floor(randomFn() * source.length);
    return { x: source[index][0], y: source[index][1] };
  }

  function moveVisitorToward(state, visitor, target) {
    const queue = [[visitor.x, visitor.y, []]];
    const visited = new Set([`${visitor.x},${visitor.y}`]);

    while (queue.length) {
      const [x, y, path] = queue.shift();
      if (x === target.x && y === target.y) {
        return path[0] || null;
      }
      neighbors(state, x, y).forEach(([nx, ny]) => {
        const key = `${nx},${ny}`;
        if (visited.has(key) || !isWalkable(getTile(state, nx, ny))) {
          return;
        }
        visited.add(key);
        queue.push([nx, ny, [...path, { x: nx, y: ny }]]);
      });
    }

    return null;
  }

  function handleVisitorInteraction(state, visitor, randomFn) {
    const near = neighbors(state, visitor.x, visitor.y)
      .map(([x, y]) => getTile(state, x, y))
      .filter(Boolean);

    near.forEach((tile) => {
      if (tile.structure === "ride" && tile.rideId) {
        const ride = state.rides[tile.rideId];
        if (ride) {
          ride.queue += 1;
          visitor.mood += 8;
        }
      }
      if (tile.structure === "food") {
        state.funds += 12;
        visitor.mood += 5;
        state.cleanliness -= 0.22;
      }
      if (tile.structure === "tree" || tile.structure === "decor") {
        visitor.mood += 2;
      }
      if (tile.structure === "building") {
        state.cleanliness += 0.15;
      }
    });

    visitor.mood = clamp(visitor.mood, 30, 100);
    visitor.target = pickVisitorTarget(state, randomFn);
  }

  function simulateTick(state, dt = 1, randomFn = Math.random) {
    state.spawnTimer += dt;
    if (state.spawnTimer >= VISITOR_SPAWN_INTERVAL && findReachablePaths(state).length > 1) {
      state.spawnTimer = 0;
      state.visitors.push({
        x: ENTRANCE_X,
        y: ENTRANCE_Y,
        mood: clamp(INITIAL_MOOD_BASE + randomFn() * INITIAL_MOOD_VARIANCE, 0, 100),
        target: null,
      });
    }

    state.visitors.forEach((visitor) => {
      if (!visitor.target) {
        visitor.target = pickVisitorTarget(state, randomFn);
      }
      if (!visitor.target) {
        return;
      }

      if (visitor.x === visitor.target.x && visitor.y === visitor.target.y) {
        handleVisitorInteraction(state, visitor, randomFn);
        return;
      }

      const next = moveVisitorToward(state, visitor, visitor.target);
      if (next) {
        visitor.x = next.x;
        visitor.y = next.y;
      } else {
        visitor.target = pickVisitorTarget(state, randomFn);
      }
    });

    let queueTotal = 0;
    Object.values(state.rides).forEach((ride) => {
      ride.cycleTimer += dt;
      queueTotal += ride.queue;
      if (ride.cycleTimer >= RIDE_CYCLE_DURATION) {
        ride.cycleTimer = 0;
        const served = Math.min(ride.queue, RIDE_CAPACITY_PER_CYCLE);
        ride.queue -= served;
        state.funds += served * 22;
        state.servedVisitors += served;
        ride.status = served > 0 ? "運行中" : "待機";
      }
    });

    const buildingCount = countStructures(state, "building");
    const decorCount = countStructures(state, "decor") + countStructures(state, "tree");
    const foodCount = countStructures(state, "food");
    state.funds -= buildingCount * BUILDING_MAINTENANCE_COST;
    state.cleanliness +=
      buildingCount * BUILDING_CLEANLINESS_BONUS +
      decorCount * DECOR_CLEANLINESS_BONUS -
      state.visitors.length * VISITOR_CLEANLINESS_PENALTY -
      foodCount * FOOD_CLEANLINESS_PENALTY;
    state.cleanliness = clamp(state.cleanliness, 0, 100);

    const avgMood = state.visitors.length
      ? state.visitors.reduce((sum, v) => sum + v.mood, 0) / state.visitors.length
      : 62;
    state.averageQueue = Object.keys(state.rides).length ? queueTotal / Object.keys(state.rides).length : 0;
    state.satisfaction = clamp(
      avgMood * SATISFACTION_MOOD_WEIGHT +
      state.cleanliness * SATISFACTION_CLEANLINESS_WEIGHT -
      state.averageQueue * SATISFACTION_QUEUE_PENALTY,
      0,
      100
    );

    if (state.visitors.length > MAX_VISITORS) {
      state.visitors.splice(0, state.visitors.length - MAX_VISITORS);
    }
  }

  function countStructures(state, type) {
    let count = 0;
    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        if (state.tiles[y][x].structure === type) {
          count += 1;
        }
      }
    }
    return count;
  }

  function nextRound(state) {
    state.round += 1;
    const growthBonus = Math.floor(
      state.satisfaction * ROUND_SATISFACTION_BONUS_MULTIPLIER +
      state.visitors.length * ROUND_VISITOR_BONUS_MULTIPLIER
    );
    state.funds += growthBonus;
    state.cleanliness = clamp(state.cleanliness + 5, 0, 100);
  }

  const api = {
    STRUCTURES,
    createInitialState,
    placeStructure,
    removeStructure,
    simulateTick,
    nextRound,
    countStructures,
    clamp,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.GameLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
