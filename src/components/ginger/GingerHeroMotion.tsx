"use client";

import { useEffect } from "react";

/** Video playback, intro motion, and pizza parallax for the server-rendered hero. */
export function GingerHeroMotion() {
  useEffect(() => {
    const root = document.getElementById("ginger-hero");
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    root.classList.add("intro");
    const frame = requestAnimationFrame(() => root.classList.add("intro-play"));
    const timer = window.setTimeout(() => root.classList.remove("intro", "intro-play"), 5000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const video = document.querySelector<HTMLVideoElement>("#ginger-hero video.sky");
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    video.muted = true;
    let started = false;
    const play = () => {
      if (video.paused) video.play()?.catch(() => {});
    };
    const start = () => {
      if (started) return;
      started = true;
      if (!video.src) {
        video.preload = "metadata";
        video.src = "/assets/video/ginger-amber-petrol.mp4";
      }
      video.addEventListener("canplay", play);
      play();
    };
    const idle =
      "requestIdleCallback" in window
        ? window.requestIdleCallback(start, { timeout: 1800 })
        : 0;
    const timer = window.setTimeout(start, 1200);
    const onVisible = () => {
      if (document.visibilityState === "visible") start();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (idle) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
      video.removeEventListener("canplay", play);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const layer = document.querySelector<HTMLElement>("#ginger-hero .pizza-space");
    if (!layer) return;
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)");
    let x = 0;
    let y = 0;
    let targetX = 0;
    let targetY = 0;
    let frame = 0;

    const tick = () => {
      x += (targetX - x) * 0.085;
      y += (targetY - y) * 0.085;
      const settled = Math.abs(targetX - x) < 0.02 && Math.abs(targetY - y) < 0.02;
      if (settled) {
        x = targetX;
        y = targetY;
      }
      layer.style.setProperty("--mouse-x", `${x.toFixed(3)}px`);
      layer.style.setProperty("--mouse-y", `${y.toFixed(3)}px`);
      frame = settled ? 0 : requestAnimationFrame(tick);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const move = (event: PointerEvent) => {
      if (!motion.matches || event.pointerType === "touch") return;
      targetX = (event.clientX / window.innerWidth - 0.5) * 24;
      targetY = (event.clientY / window.innerHeight - 0.5) * 18;
      schedule();
    };
    const reset = () => {
      targetX = 0;
      targetY = 0;
      schedule();
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      x = y = targetX = targetY = 0;
      layer.style.setProperty("--mouse-x", "0px");
      layer.style.setProperty("--mouse-y", "0px");
      window.removeEventListener("pointermove", move);
      if (motion.matches) window.addEventListener("pointermove", move, { passive: true });
    };
    document.documentElement.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    const onHide = () => {
      if (document.hidden) sync();
    };
    document.addEventListener("visibilitychange", onHide);
    motion.addEventListener("change", sync);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", onHide);
      motion.removeEventListener("change", sync);
    };
  }, []);

  return null;
}
