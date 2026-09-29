import type { Metadata } from "next";
import { SecurityAuditReport } from "@/components/SecurityAuditReport";

export const metadata: Metadata = {
  title: "Security · Ginger",
  description:
    "Ginger NFT marketplace security assessment — payments, access control, dependencies, and residual risk during public beta.",
};

export default function SecurityPage() {
  return (
    <main>
      <SecurityAuditReport />
    </main>
  );
}
