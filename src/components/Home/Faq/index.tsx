"use client";

import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { FAQ_ITEMS, FAQ_UPDATED } from "@/lib/faq-content";

const Faq = () => {
  return (
    <section id="faq" className="py-16 text-foreground">
      <div className="container">
        <div className="mx-auto px-4">
          <div className="mb-10 text-center">
            <p className="text-sm uppercase text-primary">Popular questions</p>
            <h1 className="mt-2 text-3xl font-semibold md:text-4xl">
              NFT marketplace FAQ
            </h1>
            <p className="mt-2 text-muted-foreground">
              How to launch, mint, and trade Solana NFTs on Ginger.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Updated <time dateTime={FAQ_UPDATED}>30 September 2026</time>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Security:{" "}
              <Link href="/security" className="text-primary underline-offset-2 hover:underline">
                read our report
              </Link>
            </p>
          </div>
          <Accordion className="space-y-4">
            {FAQ_ITEMS.map((item, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="rounded-lg border-none bg-card px-4"
              >
                <AccordionTrigger className="py-4 text-lg font-medium hover:no-underline **:data-[slot=accordion-trigger-icon]:hidden">
                  {item.question}
                  <PlusIcon className="h-6 w-6 shrink-0 transition-transform duration-200 group-aria-expanded/accordion-trigger:rotate-45" />
                </AccordionTrigger>
                <AccordionContent className="text-base text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default Faq;
