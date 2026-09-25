# DoorJam

DoorJam turns ordinary Owlbear Rodeo image items into artwork-driven doors. Doors work on their own and can optionally synchronize with the official Dynamic Fog extension or Smoke & Spectre.

## GM workflow

1. Place a closed-door image, choose **Set Images** from its context menu or the DoorJam toolbar, then set its open artwork. The existing image becomes the closed artwork and the chosen asset becomes the open artwork.
2. Switch to **Operate Door** and click the door image to open or close it with one click—even when the image is locked.
3. Optionally use **Link Dynamic Fog Door** or **Link Smoke & Spectre Door**. DoorJam links a unique nearby door or attempts provider-specific creation when none exists.

The context menu and toolbar expose the same DoorJam actions in the same order.

While a fog-provider link is valid, that provider is authoritative and DoorJam mirrors changes made through it. If the link becomes unavailable, the image remains operable using its last displayed state. **Unlink Door** removes only the reference; **Remove Door** removes standalone DoorJam configuration while preserving the displayed image and underlying provider door.

## Smoke & Spectre support

DoorJam recognizes Smoke obstruction curves on the Pointers layer with `com.battle-system.smoke/isDoor: true`. It can link an intersecting or uniquely nearby door, or split one straight, open, two-point obstruction crossing the artwork into two wall remainders and an independently operable door. It does not attempt to infer a door from gaps between separate obstruction segments. Multi-point or genuinely curved paths, closed polygons, multiple intersections, tiny wall remainders, and obstructions with dependent attachments are rejected without modifying the original.

New split items inherit the predecessor's style, layer, transforms, locking, attachment configuration, and unrelated metadata. DoorJam does not special-case metadata from other extensions. Smoke's metadata is private and has no published integration API; runtime compatibility must be verified in an Owlbear development room. For a valid Smoke door, opening sets both `doorOpen` and `disabled`, while closing removes both canonical door-state flags.

## Development

```sh
pnpm install
pnpm dev
```

Install `http://localhost:5173/manifest-local.json` in an Owlbear Rodeo development room. Run `pnpm build` for a production build.

By default, players can operate unlocked doors from the DoorJam tool, context menu, or extension panel. GMs can lock individual doors and can disable player door operation for the entire scene from the DoorJam tool menu.

While the DoorJam tool is active for the GM, each configured door displays centered lock and Dynamic Fog link status glyphs. Double-click the lock glyph to toggle the door lock. Double-click the linked glyph to unlink it; double-click the unlinked glyph to link a nearby Dynamic Fog door or create one along an intersecting fog edge when no door is in range.

The production extension is hosted at `https://doorjam.ex-asperis.com`. Install it in Owlbear Rodeo using `https://doorjam.ex-asperis.com/manifest.json` (or the version-pinned `manifest-v0.12.0.json`).

Private provider metadata is isolated in `src/dynamicFog/adapter.ts` and `src/smoke/adapter.ts`. Neither provider exposes a formal cross-extension door API, so representation changes should remain confined to those adapters and their geometry helpers.
