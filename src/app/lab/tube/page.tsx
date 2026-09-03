// PLACEHOLDER — throwaway spike route, not linked from the real site.
import { Suspense } from "react";
import TubeSpike from "@/motion/lab/TubeSpike";
import { getFeaturedPhotos } from "@/data/photos";

export default function TubeLabPage() {
  const photos = getFeaturedPhotos();

  // useSearchParams (for the ?debug=1 acceptance-test mode) requires a
  // Suspense boundary in the App Router.
  return (
    <Suspense>
      <TubeSpike photos={photos} />
    </Suspense>
  );
}
