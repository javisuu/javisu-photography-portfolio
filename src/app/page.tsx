// The actual landing is rendered persistently from the root layout, not
// here — see layout.tsx's own comment for why. This route still needs a
// page.tsx to exist (App Router requires one per routable segment), it
// just renders nothing of its own.
export default function Home() {
  return null;
}
