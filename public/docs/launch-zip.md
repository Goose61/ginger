# Launch ZIP formats (Ginger)

Ginger’s Launch Wizard supports two paths. Both uploads are **`.zip` files**, max **500 MB**, processed in your browser then stored locally until go-live (Arweave upload).

---

## 1. Finished art (“I have finished art”)

Use this when every NFT image is already rendered.

### What you need

| Requirement | Details |
|-------------|---------|
| **Images** | At least one file; formats **PNG, JPG/JPEG, or WebP** |
| **Ordering** | Images are sorted **alphabetically by path** (natural numeric sort). Token `#1` = first image, `#2` = second, etc. |
| **Metadata** | **Optional.** Per-token JSON sidecars for names, traits, royalties |
| **Wallet** | Solana wallet to save draft (Avalanche home: connect EVM + Solana for storage at go-live) |

### Recommended ZIP layout

```text
my-collection.zip
├── 001.png                 # or any folder structure; order = sort path
├── 002.png
├── 003.webp
└── metadata/               # optional
    ├── 001.json
    ├── 002.json
    └── 003.json
```

Alternative layouts also work:

```text
my-collection.zip
├── images/
│   ├── 1.png
│   └── 2.png
└── metadata/
    ├── 1.json
    └── 2.json
```

```text
my-collection.zip
├── art/
│   └── token-42.png        # matched to metadata/42.json or metadata/042.json
└── metadata/
    └── 42.json
```

### Sidecar JSON (optional)

Place JSON next to the image, under `metadata/`, or under `json/`. Ginger skips aggregate files like `_metadata.json` or `collection.json`.

Supported fields (typical OpenSea / Metaplex-style):

- `name`, `description`, `symbol`
- `attributes`: `[{ "trait_type": "...", "value": "..." }]`
- `seller_fee_basis_points` or `sellerFeeBasisPoints`
- `properties.creators` or `creators`: `[{ "address": "...", "share": 100 }]`
- `image` (often rewritten at upload)

Numeric matching: `1`, `01`, `001` are treated as the same token id when pairing image ↔ JSON.

### After upload

- Traits are inferred from `attributes` (or empty if no sidecars).
- **Advanced launch:** tune rarity tiers and trait price modifiers on the Traits step.
- **Standard launch:** defaults apply; confirm metadata on the Metadata step before go-live.

### Avoid

- `__MACOSX`, `.DS_Store`
- Non-image files as “tokens” (only png/jpg/webp count)
- Empty ZIP or ZIP with only JSON and no images

---

## 2. Trait layers (“I have trait layers”)

Use this when you have **separate PNG layers** and want Ginger to **composite every combination**.

### What you need

| Requirement | Details |
|-------------|---------|
| **Structure** | **Two folder levels minimum:** `TraitType/Value.png` |
| **Formats** | **PNG, WebP, or JPG** per layer file |
| **Transparency** | PNG with alpha recommended for stacking |
| **Supply cap** | Combinations capped at **10,000** tokens at import |
| **Wallet** | Solana wallet to save draft |

### Required ZIP layout

```text
layers.zip
├── Background/
│   ├── Blue.png
│   ├── Red.png
│   └── Green.png
├── Body/
│   ├── Ape.png
│   └── Robot.png
├── Eyes/
│   ├── Normal.png
│   └── Laser.png
└── Hat/
    ├── None.png          # filename without extension = trait value "None"
    └── Crown.png
```

Rules:

- **Folder name** = `trait_type` (e.g. `Background`, `Eyes`).
- **File name (no extension)** = trait **value** (e.g. `Blue.png` → value `Blue`).
- Files at the ZIP root (no parent folder) are **ignored**.
- Layer **stack order** = folder order discovered in the ZIP (you can reorder in the Rarity / Preview steps for layer mode).

### Supply

Total combinations = product of `(values per trait type)`. Example: 3 × 2 × 2 × 2 = **24** NFTs.

If the product exceeds 10,000, import uses `min(combinations, 10_000)`.

### After upload

- **Layer mode** adds wizard steps: **Rarity** (weights) and **Preview** (sample composites).
- At go-live, full set is generated in the browser, then uploaded to Arweave.
- **Advanced launch:** Fees, Reveal, Milestones optional.
- **Standard launch:** Metadata → Collection → Payments → Go live.

### Avoid

- Single-folder flat dumps (`Blue.png` at root with no `Background/` parent)
- Non-image assets mixed in without trait folders
- Extremely large layer sets without checking combination count (10k cap)

---

## Quick comparison

| | Finished art | Trait layers |
|---|--------------|--------------|
| **ZIP shape** | Any tree of images (+ optional `metadata/`) | `TraitType/Value.png` only |
| **Token count** | = number of images | = product of layer values (max 10k) |
| **Metadata source** | Your JSON or generated at go-live | Generated from composed traits |
| **Best for** | 1/1s, pre-rendered PFPs | Generative art from layers |

---

## Related

- Application code: [`Crypgo/web`](../web)
- Omnichain spokes: [`OMNICHAIN.md`](OMNICHAIN.md)
- Parsers: [`client-zip-import.ts`](../web/src/lib/client-zip-import.ts), [`client-layer-import.ts`](../web/src/lib/client-layer-import.ts)
