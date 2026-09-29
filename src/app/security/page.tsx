import type { Metadata } from "next";
import { SecurityAuditReport } from "@/components/SecurityAuditReport";

export const metadata: Metadata = {
  title: "Security · Ginger",
  description:
    "How Ginger protects collectors and creators — payments, wallet auth, marketplace controls, and the full downloadable security report.",
};

export default function SecurityPage() {
  return (
    <main>
      <SecurityAuditReport />
    </main>
  );
}
