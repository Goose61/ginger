import Link from "next/link";
import { GingerHeader } from "@/components/ginger/GingerHeader";
import { GingerHeroMotion } from "@/components/ginger/GingerHeroMotion";
import { GingerHomeLock } from "@/components/ginger/GingerHomeLock";

const CRUMBS = [
  { cx: "20%", cy: "61%", size: "6px", duration: "12s", delay: "-2s", angle: "18deg", alpha: "0.55" },
  { cx: "38%", cy: "75%", size: "5px", duration: "14s", delay: "-7s", angle: "78deg", alpha: "0.65" },
  { cx: "65%", cy: "62%", size: "7px", duration: "11s", delay: "-3s", angle: "120deg", alpha: "0.7" },
  { cx: "78%", cy: "72%", size: "5px", duration: "15s", delay: "-8s", angle: "30deg", alpha: "0.55" },
  { cx: "56%", cy: "90%", size: "4px", duration: "13s", delay: "-4s", angle: "200deg", alpha: "0.45" },
  { cx: "32%", cy: "85%", size: "6px", duration: "16s", delay: "-9s", angle: "280deg", alpha: "0.6" },
  { cx: "82%", cy: "59%", size: "4px", duration: "12s", delay: "-6s", angle: "90deg", alpha: "0.5" },
];

export function GingerHero() {
  return (
    <div className="ginger-hero frame" id="ginger-hero">
      <GingerHomeLock />
      <GingerHeroMotion />
      <video
        className="sky"
        aria-hidden="true"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/assets/images/ginger-amber-petrol.webp"
        src="/assets/video/ginger-amber-petrol.mp4"
      />
      <div className="veil" />
      <div className="pizza-space">
        {CRUMBS.map((crumb) => (
          <span
            key={crumb.cx + crumb.cy}
            className="pizza-crumb"
            style={{
              ["--cx" as string]: crumb.cx,
              ["--cy" as string]: crumb.cy,
              ["--size" as string]: crumb.size,
              ["--duration" as string]: crumb.duration,
              ["--delay" as string]: crumb.delay,
              ["--angle" as string]: crumb.angle,
              ["--alpha" as string]: crumb.alpha,
            }}
          />
        ))}
        <Link className="pizza-object pizza-box" href="/explore" aria-label="Explore NFTs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/images/ginger-pizza.png" alt="" draggable={false} />
        </Link>
        <div className="pizza-object pizza-slice">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/images/ginger-pizza.png" alt="" />
        </div>
        <div className="pizza-object pizza-distant">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/images/ginger-pizza.png" alt="" />
        </div>
      </div>
      <GingerHeader />
      <div className="screen">
        <main className="hero">
          <Link className="pill" href="/explore">
            <span className="chip">✦</span>
            <span className="pill-label">Welcome to Ginger</span>
            <svg viewBox="0 0 9.5 8" fill="none" aria-hidden="true">
              <path
                d="M0.7 4H8.8M5.6 0.75 8.85 4 5.6 7.25"
                stroke="currentColor"
                strokeWidth="1.35"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <h1>
            <span className="ln">
              <span className="ln-i">ENTER THE</span>
            </span>
            <span className="ln">
              <span className="ln-i">GINGERVERSE</span>
            </span>
          </h1>
          <p>Collect weird. Trade rare. Stay Ginger.</p>
          <div className="cta">
            <Link className="btn ghost" href="/launch">
              Explore NFTs
            </Link>
            <Link className="btn solid" href="/explore">
              Enter Marketplace
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
