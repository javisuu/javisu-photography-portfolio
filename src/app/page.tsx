import LandingComposition from "@/motion/LandingComposition";
import { getFeaturedPhotos } from "@/data/photos";

export default function Home() {
  const photos = getFeaturedPhotos();
  return <LandingComposition photos={photos} />;
}
