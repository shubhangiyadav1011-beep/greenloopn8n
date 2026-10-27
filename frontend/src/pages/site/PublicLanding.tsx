import { useEffect } from "react";

// Home links from the SPA open the standalone public experience in a fresh
// document, keeping its styles and WebGL lifecycle separate from the app.
export default function PublicLanding() {
  useEffect(() => {
    window.location.replace(`/${window.location.search}${window.location.hash}`);
  }, []);
  return null;
}
