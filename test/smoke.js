// End-to-end smoke test: a TV and three phones play a whole game over real
// sockets. The TV's mini-game reports are simulated (they run in the browser).
const assert = require('assert');
const { io } = require('socket.io-client');
const { server } = require('../server');
const { validDrawing, starsFor } = require('../src/room');

const call = (sock, ev, data) => new Promise((res) => sock.emit(ev, data, res));

let hostState = null;
const waiters = new Set();
function onHostState(st) {
  hostState = st;
  for (const w of waiters) if (w.pred(st)) { waiters.delete(w); w.res(st); }
}
const waitHost = (pred) => new Promise((res) => {
  if (hostState && pred(hostState)) return res(hostState);
  waiters.add({ pred, res });
});

// Unit checks.
assert.strictEqual(validDrawing({ strokes: [] }), null, 'empty drawing rejected');
assert.strictEqual(validDrawing({ strokes: [{ c: 99, w: 0, p: [1, 1] }] }), null, 'bad color rejected');
assert.strictEqual(validDrawing({ strokes: [{ c: 0, w: 0, p: [1, 999] }] }), null, 'out of bounds rejected');
assert.ok(validDrawing({ strokes: [{ c: 1, w: 2, p: [10, 10, 20, 20] }], eyes: [{ x: 50, y: 50, s: 2 }] }));
assert.deepStrictEqual([starsFor(0), starsFor(0.5), starsFor(0.9)], [1, 2, 3]);

const doodle = (n) => ({ strokes: [{ c: n % 8, w: 1, p: [50, 50, 150, 80, 250, 200] }], eyes: [{ x: 120, y: 100, s: 2 }] });

server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}`;
  const open = () => io(url, { forceNew: true, transports: ['websocket'] });
  const latest = new Map();

  try {
    const host = open();
    host.on('host:state', onHostState);
    const inputs = [];
    host.on('input', (m) => inputs.push(m));
    const { code } = await call(host, 'host:create');

    assert.ok((await call(open(), 'player:join', { code, name: 'Zed' })).error, 'age is required');
    const names = [['Mia', 4], ['Leo', 6], ['Ava', 8]];
    const kids = [];
    for (const [name, age] of names) {
      const s = open();
      s.on('player:state', (st) => latest.set(name, st));
      const res = await call(s, 'player:join', { code, name, age });
      assert.ok(res.playerId, res.error);
      kids.push({ name, s });
    }
    const act = (i, msg) => call(kids[i].s, 'player:action', msg);
    await waitHost((st) => st.players.length === 3);
    assert.strictEqual(new Set(hostState.players.map((p) => p.color)).size, 3, 'distinct colors');

    // Only the first kid (leader) can start.
    assert.ok((await act(1, { type: 'start' })).error);
    assert.strictEqual((await act(0, { type: 'start' })).error, null);
    await waitHost((st) => st.phase === 'draw');
    assert.deepStrictEqual(hostState.games, ['balloon', 'dragon', 'seek', 'feather']);

    // Drawing.
    assert.ok((await act(0, { type: 'drawing', drawing: { strokes: [] } })).error, 'blank drawing rejected');
    for (let i = 0; i < 3; i++) assert.strictEqual((await act(i, { type: 'drawing', drawing: doodle(i) })).error, null);
    await waitHost((st) => st.phase === 'meet');
    assert.ok(hostState.players.every((p) => p.critter && p.critter.strokes.length));

    const keyOf = (name) => hostState.players.find((p) => p.name === name).key;
    const skip = () => call(host, 'host:action', { action: 'skip' });

    for (const gameName of hostState.games) {
      await skip(); // meet/results -> intro
      await waitHost((st) => st.phase === 'intro' && st.game === gameName);
      await skip(); // intro -> play
      await waitHost((st) => st.phase === 'play' && st.game === gameName);

      if (gameName === 'seek') {
        // Each kid hides once (3 rounds). Round 1: found by a seeker; others: nobody finds.
        for (let round = 0; round < 3; round++) {
          await waitHost((st) => st.seek && st.seek.round === round && st.seek.stage === 'hide');
          const hiderKey = hostState.seek.hider;
          const hiderIdx = kids.findIndex((k) => keyOf(k.name) === hiderKey);
          const seekerIdx = (hiderIdx + 1) % 3;
          assert.ok((await act(seekerIdx, { type: 'hide', spot: 1 })).error, 'only the hider hides');
          assert.strictEqual((await act(hiderIdx, { type: 'hide', spot: 3 })).error, null);
          const st = await waitHost((s) => s.seek.stage === 'seek' && s.seek.round === round);
          assert.strictEqual(st.seek.spot, 3, 'TV knows the spot');
          await new Promise((r) => setTimeout(r, 30));
          assert.strictEqual(latest.get(kids[seekerIdx].name).seek.spot, null, 'seekers do not');

          // Seekers' flashlight positions are relayed to the TV.
          kids[seekerIdx].s.emit('player:input', { kind: 'light', x: 0.4, y: 0.5, on: true });
          if (round === 0) {
            assert.ok((await call(host, 'host:found', { finder: hiderKey })).error, 'hider cannot find themselves');
            assert.strictEqual((await call(host, 'host:found', { finder: keyOf(kids[seekerIdx].name) })).error, null);
          } else {
            await skip(); // time runs out: nobody found them
          }
          await waitHost((s) => s.seek.stage === 'reveal' && s.seek.round === round);
          if (round < 2) {
            // Skip the reveal pause by waiting for the next round.
            await waitHost((s) => s.seek.round === round + 1);
          }
        }
        await waitHost((st) => st.phase === 'results');
        assert.ok(inputs.some((m) => m.kind === 'light' && m.x === 0.4), 'light input relayed');
      } else {
        if (gameName === 'feather') {
          // A latecomer joins mid-game: she waits, draws her own critter now, earns nothing yet.
          const zoe = open();
          zoe.on('player:state', (st) => latest.set('Zoe', st));
          await call(zoe, 'player:join', { code, name: 'Zoe', age: 5 });
          const st = await waitHost((s) => s.players.some((p) => p.name === 'Zoe'));
          const z = st.players.find((p) => p.name === 'Zoe');
          assert.ok(z.critter && z.auto && z.waiting, 'latecomer gets a stand-in critter and waits');
          assert.strictEqual((await call(zoe, 'player:action', { type: 'drawing', drawing: doodle(7) })).error, null, 'latecomer can draw');
          await waitHost((s) => s.players.find((p) => p.name === 'Zoe').auto === false);
          kids.push({ name: 'Zoe', s: zoe });
        }
        // Mic levels from phones reach the TV.
        kids[0].s.emit('player:input', { kind: 'mic', e: 0.8 });
        await new Promise((r) => setTimeout(r, 30));
        assert.ok(inputs.some((m) => m.kind === 'mic' && m.key === keyOf('Mia') && m.e === 0.8), 'mic input relayed');
        // The TV reports scores: Mia great, Leo okay, Ava (missing) gets the minimum.
        assert.ok((await call(host, 'host:result', { game: 'nope', scores: {} })).error, 'wrong game rejected');
        assert.strictEqual((await call(host, 'host:result', {
          game: gameName, scores: { [keyOf('Mia')]: 0.9, [keyOf('Leo')]: 0.5 },
        })).error, null);
        const res = await waitHost((st) => st.phase === 'results');
        assert.deepStrictEqual(
          [res.results.stars[keyOf('Mia')], res.results.stars[keyOf('Leo')], res.results.stars[keyOf('Ava')]],
          [3, 2, 1],
        );
        if (gameName === 'feather') assert.strictEqual(res.results.stars[keyOf('Zoe')], undefined, 'latecomer earns nothing this game');
      }
    }

    await skip(); // last results -> parade
    const parade = await waitHost((st) => st.phase === 'parade');
    // Mic games: Mia 3+3+3, Leo 2+2+2, Ava 1+1+1, plus seek stars.
    // Zoe joined after hide & seek, so she has no stars for it.
    const seekStars = Object.fromEntries(parade.players.filter((p) => p.name !== 'Zoe').map((p) => [p.name, p.gameStars.seek]));
    assert.ok(Object.values(seekStars).every((s) => s >= 1 && s <= 3));
    assert.strictEqual(parade.players.find((p) => p.name === 'Mia').stars, 9 + seekStars.Mia);
    assert.strictEqual(parade.players.find((p) => p.name === 'Ava').stars, 3 + seekStars.Ava);

    assert.strictEqual(parade.players.find((p) => p.name === 'Zoe').stars, 0);
    assert.strictEqual((await act(1, { type: 'playAgain' })).error, null, 'anyone can press play again');
    await waitHost((st) => st.phase === 'draw' && st.players.length === 4 && st.players.every((p) => !p.critter));
    console.log('✓ smoke test passed: draw, meet, balloon, dragon, hide & seek, feather, parade, late join, play again');
    process.exit(0);
  } catch (e) {
    console.error('✗ smoke test failed:', e);
    process.exit(1);
  }
});
