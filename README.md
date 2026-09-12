# DoorJam

DoorJam turns ordinary Owlbear Rodeo image items into artwork-driven doors. Doors work on their own and can optionally synchronize with doors created by the official Dynamic Fog extension.

## GM workflow

1. Place a closed-door image, then choose **Set Open Door Image** from its context menu or the DoorJam toolbar. The existing image becomes the closed artwork and the chosen asset becomes the open artwork.
2. Switch to **Operate Door** and click the door image to open or close it with one click—even when the image is locked.
3. Optionally use **Link Dynamic Fog Door**. DoorJam links the nearest Dynamic Fog door within range, or attempts to create one along the fog edge intersecting the image when none is nearby.

The context menu and toolbar expose the same DoorJam actions in the same order.

While a Dynamic Fog link is valid, Dynamic Fog is authoritative and DoorJam mirrors changes made through it. If the link becomes unavailable, the image remains operable using its last displayed state. **Unlink Door** removes only the fog reference; **Remove Door** removes standalone DoorJam configuration while preserving the displayed image.

## Development

```sh
pnpm install
pnpm dev
```

Install `http://localhost:5173/manifest-local.json` in an Owlbear Rodeo development room. Run `pnpm build` for a production build.

By default, players can operate unlocked doors from the DoorJam tool, context menu, or extension panel. GMs can lock individual doors and can disable player door operation for the entire scene from the DoorJam tool menu.

While the DoorJam tool is active for the GM, each configured door displays centered lock and Dynamic Fog link status glyphs. Double-click the lock glyph to toggle the door lock. Double-click the linked glyph to unlink it; double-click the unlinked glyph to link a nearby Dynamic Fog door or create one along an intersecting fog edge when no door is in range.

The production extension is hosted at `https://doorjam.ex-asperis.com`. Install it in Owlbear Rodeo using `https://doorjam.ex-asperis.com/manifest.json` (or the version-pinned `manifest-v0.9.0.json`).

The private Dynamic Fog metadata key `rodeo.owlbear.dynamic-fog/doors` is isolated in `src/dynamicFog/adapter.ts`. Dynamic Fog does not expose a formal door API, so future representation changes should require updates only in that adapter and its geometry helper.
