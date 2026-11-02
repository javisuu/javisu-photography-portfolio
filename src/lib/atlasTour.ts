// The atlas tour (spec 016, amendment 3): one open path through every
// place in the archive — a place being a city — so the viewer can step
// through all the photographs in geographic order, and the globe follows.
//
// With a dozen places this is solved outright at build time: nearest
// neighbour from every starting place, each improved with 2-opt, and the
// shortest wins. The path starts at whichever end's place comes first in
// album order, so the tour opens where the archive itself does. Inside a
// place, photos keep the order they came in (album order).
//
// Pure and deterministic: same input, same tour.

type Located = { lat: number; lng: number; city: string; country: string };

const DEG = Math.PI / 180;

function unit(lat: number, lng: number): [number, number, number] {
  return [Math.cos(lat * DEG) * Math.cos(lng * DEG), Math.cos(lat * DEG) * Math.sin(lng * DEG), Math.sin(lat * DEG)];
}

function angle(a: [number, number, number], b: [number, number, number]): number {
  return Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
}

function pathLength(path: number[], d: number[][]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += d[path[i - 1]][path[i]];
  return total;
}

// 2-opt on an OPEN path: reversing path[i..j] swaps edges (i-1, i) and
// (j, j+1); a missing neighbour past either end costs nothing.
function twoOpt(path: number[], d: number[][]): number[] {
  const p = [...path];
  const n = p.length;
  const edge = (a: number, b: number) => (a < 0 || b >= n ? 0 : d[p[a]][p[b]]);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const before = edge(i - 1, i) + edge(j, j + 1);
        const after = (i - 1 < 0 ? 0 : d[p[i - 1]][p[j]]) + (j + 1 >= n ? 0 : d[p[i]][p[j + 1]]);
        if (after < before - 1e-12) {
          p.splice(i, j - i + 1, ...p.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return p;
}

// Returns the items in tour order, each with `stop`: the index of its place
// along the tour (consecutive photos of one place share it).
export function atlasTour<T extends Located>(items: T[]): (T & { stop: number })[] {
  const placeOf = new Map<string, number>();
  const places: { items: T[] }[] = [];
  for (const item of items) {
    const key = `${item.country}|${item.city}`;
    if (!placeOf.has(key)) {
      placeOf.set(key, places.length);
      places.push({ items: [] });
    }
    places[placeOf.get(key)!].items.push(item);
  }
  const n = places.length;
  if (n === 0) return [];
  // Each place at the unit-vector mean of its photos.
  const centre = places.map(({ items: its }) => {
    const s = [0, 0, 0];
    for (const it of its) {
      const u = unit(it.lat, it.lng);
      s[0] += u[0];
      s[1] += u[1];
      s[2] += u[2];
    }
    const len = Math.hypot(s[0], s[1], s[2]) || 1;
    return [s[0] / len, s[1] / len, s[2] / len] as [number, number, number];
  });
  const d = centre.map((a) => centre.map((b) => angle(a, b)));

  let best: number[] = [];
  let bestLen = Infinity;
  for (let start = 0; start < n; start++) {
    const seen = new Array(n).fill(false);
    const path = [start];
    seen[start] = true;
    while (path.length < n) {
      const last = path[path.length - 1];
      let next = -1;
      for (let k = 0; k < n; k++) if (!seen[k] && (next === -1 || d[last][k] < d[last][next])) next = k;
      path.push(next);
      seen[next] = true;
    }
    const improved = twoOpt(path, d);
    const len = pathLength(improved, d);
    if (len < bestLen - 1e-12) {
      best = improved;
      bestLen = len;
    }
  }
  // Places are numbered in album order: start from the end that comes first.
  if (best[best.length - 1] < best[0]) best.reverse();
  return best.flatMap((place, stop) => places[place].items.map((item) => ({ ...item, stop })));
}
