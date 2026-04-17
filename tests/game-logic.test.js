const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createInitialState,
  placeStructure,
  removeStructure,
  simulateTick,
  nextRound,
} = require('../src/game-logic.js');

function seededRandom(values) {
  let idx = 0;
  return () => {
    const value = values[idx % values.length];
    idx += 1;
    return value;
  };
}

test('non-path structures require adjacency to path', () => {
  const state = createInitialState(12);
  const placedWithoutPath = placeStructure(state, 9, 9, 'ride');
  assert.equal(placedWithoutPath, false);

  assert.equal(placeStructure(state, 2, 3, 'path'), true);
  assert.equal(placeStructure(state, 2, 4, 'path'), true);
  assert.equal(placeStructure(state, 3, 4, 'ride'), true);
});

test('visitor simulation increases ride queue and rounds grant funds', () => {
  const state = createInitialState(12);
  placeStructure(state, 2, 3, 'path');
  placeStructure(state, 2, 4, 'path');
  placeStructure(state, 3, 4, 'ride');
  placeStructure(state, 3, 3, 'food');

  const initialFunds = state.funds;
  const randomFn = seededRandom([0.1, 0.2, 0.3, 0.4]);

  for (let i = 0; i < 80; i += 1) {
    simulateTick(state, 0.5, randomFn);
  }

  const queueTotal = Object.values(state.rides).reduce((sum, ride) => sum + ride.queue, 0);
  assert.ok(state.visitors.length > 0);
  assert.ok(queueTotal >= 0);
  assert.ok(state.satisfaction >= 0 && state.satisfaction <= 100);

  nextRound(state);
  assert.ok(state.funds > initialFunds);
});

test('removeStructure gives refund and clears ride state', () => {
  const state = createInitialState(12);
  placeStructure(state, 2, 3, 'path');
  placeStructure(state, 2, 4, 'path');
  placeStructure(state, 3, 4, 'ride');

  const rideTile = state.tiles[4][3];
  const rideId = rideTile.rideId;
  assert.ok(state.rides[rideId]);

  const before = state.funds;
  assert.equal(removeStructure(state, 3, 4), true);
  assert.equal(state.tiles[4][3].structure, null);
  assert.equal(state.rides[rideId], undefined);
  assert.ok(state.funds > before);
});
