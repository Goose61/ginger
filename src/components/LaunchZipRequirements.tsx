"use client";

import { useState } from "react";

type Variant = "ready" | "layers";

const READY_TREE = `my-collection.zip
├── 001.png
├── 002.png
└── metadata/          (optional)
    ├── 001.json
    └── 002.json`;

const LAYERS_TREE = `layers.zip
├── Background/
│   ├── Blue.png
│   └── Red.png
├── Body/
│   └── Ape.png
└── Eyes/
    ├── Normal.png
    └── Laser.png`;

export function LaunchZipRequirements({ variant }: { variant: Variant }) {
  const [open, setOpen] = useState(false);
  const isReady = variant === "ready";

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-primary hover:underline"
      >
        {open ? "Hide" : "Show"} ZIP structure &amp; requirements
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-xs text-white/55">
          <p className="text-white/70">
            {isReady
              ? "One image per NFT (PNG, JPG, or WebP). Max 500 MB. Images sorted by path → token #1, #2, …"
              : "Two levels: TraitType/Value.png. Max 500 MB. Supply = all combinations (capped at 10,000)."}
          </p>
          <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 font-mono text-[10px] leading-relaxed text-white/80">
            {isReady ? READY_TREE : LAYERS_TREE}
          </pre>
          <ul className="list-inside list-disc space-y-1">
            {isReady ? (
              <>
                <li>Optional metadata JSON: names, attributes, royalty fields</li>
                <li>Skip macOS junk: __MACOSX, .DS_Store</li>
                <li>Pair JSON via metadata/1.json, 001.json, or same stem as image</li>
              </>
            ) : (
              <>
                <li>Folder name = trait type; file name (no ext) = trait value</li>
                <li>Optional weight in the file name: Blue#40.png (value Blue, weight 40)</li>
                <li>No metadata JSON needed. Ginger writes it from the traits at go-live</li>
                <li>PNG with transparency recommended. JPG and WebP work too</li>
                <li>Root-level images are ignored. Use trait folders</li>
              </>
            )}
          </ul>
          <a
            href="/docs/launch-zip.md"
            className="inline-block text-[11px] text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Full ZIP guide
          </a>
        </div>
      )}
    </div>
  );
}
