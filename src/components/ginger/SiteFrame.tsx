import Footer from "@/components/Layout/Footer";
import { GingerHeader } from "@/components/ginger/GingerHeader";

/** Shared chrome for every page except the full-screen homepage. */
export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="ginger-page">
      <GingerHeader />
      {children}
      <Footer />
    </div>
  );
}
