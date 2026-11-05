// Randomized backtracking: each person gives to exactly one other and receives from exactly one.
// `forbidden` is a list of [idA, idB] pairs; neither A->B nor B->A is allowed.
export function draw(ids, forbidden = []) {
  const banned = new Set();
  for (const [a, b] of forbidden) {
    banned.add(`${a}:${b}`);
    banned.add(`${b}:${a}`);
  }
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const givers = shuffle(ids);
  const taken = new Set();
  const result = new Map();

  const solve = (i) => {
    if (i === givers.length) return true;
    const giver = givers[i];
    for (const receiver of shuffle(ids)) {
      if (receiver === giver || taken.has(receiver) || banned.has(`${giver}:${receiver}`)) continue;
      taken.add(receiver);
      result.set(giver, receiver);
      if (solve(i + 1)) return true;
      taken.delete(receiver);
      result.delete(giver);
    }
    return false;
  };

  return solve(0) ? result : null;
}
