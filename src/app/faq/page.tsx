import { Metadata } from "next";
import Faq from "@/components/Home/Faq";

export const metadata: Metadata = {
  title: "FAQ · Ginger",
};

export default function FaqPage() {
  return (
    <main>
      <Faq />
    </main>
  );
}
