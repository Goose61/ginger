import { SiteFrame } from "@/components/ginger/SiteFrame";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
