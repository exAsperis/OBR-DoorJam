# DoorJam

DoorJam turns ordinary Owlbear Rodeo image items into artwork-driven doors. Each door may independently link to Dynamic Fog, Smoke & Spectre!, and one or more Stage Manager Elevators. These links coexist: one DoorJam door can control all three integrations at once.

## GM workflow

1. Place a closed-door image, choose **Set Images** from its context menu or the DoorJam toolbar, then set its open artwork. The existing image becomes the closed artwork and the chosen asset becomes the open artwork.
2. Switch to **Operate Door** and click the door image to open or close it with one click—even when the image is locked.
3. Optionally use **Link/Create Dynamic Fog Door**, **Link/Create Smoke & Spectre! Door**, or **Link Stage Manager Elevator**. Adding or replacing one integration preserves every other link.

### Editing a Dynamic Fog doorway

GMs can choose **Edit Dynamic Fog Door** from the DoorJam tool and then select either a DoorJam image linked to Dynamic Fog or one of Dynamic Fog's native door overlays. DoorJam displays two circular endpoint handles, a diamond center handle, and a highlighted preview of the actual fog opening.

- Drag an endpoint to resize the opening while keeping the other endpoint fixed.
- Drag the center handle to move the complete opening along its existing fog contour without changing its contour length.
- Press Escape, change modes, or cancel the drag to discard an unfinished edit.

Editing changes the existing Dynamic Fog metadata entry in place. It never moves, resizes, rotates, unlocks, or otherwise modifies a linked DoorJam image. Native Dynamic Fog doors can be edited without first linking an image. Smoke & Spectre links are intentionally ignored by this mode.

The editor supports Dynamic Fog lines, supported shapes, paths (including multiple contours), and cardinal-spline curves using Dynamic Fog-compatible CanvasKit contour distances. A door cannot cross the contour seam, change fog items or contours, collapse below the minimum length, or overlap another door on the same parent contour. Unsupported, stale, or ambiguous geometry is rejected without changing scene metadata.

The context menu and toolbar expose the same DoorJam actions in the same order.

DoorJam's displayed open/closed state is canonical during DoorJam operations and is fanned out to every configured integration. External Dynamic Fog and Smoke changes may still drive DoorJam when the available fog providers agree; conflicting provider states leave DoorJam unchanged. If a link becomes unavailable, the image remains operable using its last displayed state.

**Break Link** removes a sole integration immediately. When several links exist, it asks which connection to remove and preserves all other links, artwork, state, lock, and external provider items. **Remove Door** is available only for a standalone DoorJam door with no integration links.

## Stage Manager support

DoorJam uses Stage Manager's public Elevator API exclusively; it does not read or write Stage Manager's private metadata. Linking automatically selects the image itself when it is an Elevator, or the sole overlapping Elevator when unambiguous, and otherwise opens an Elevator chooser. The chooser supports toggling multiple Elevator links and remains open until explicitly closed. Opening a DoorJam door enables every linked Elevator; closing the door disables all of them. Stage Manager is one-way for state synchronization, so direct Elevator changes do not reverse-drive DoorJam.

## Smoke & Spectre support

DoorJam recognizes Smoke obstruction curves on the Pointers layer with `com.battle-system.smoke/isDoor: true`. It can link an intersecting or uniquely nearby door, or split one straight, open, two-point obstruction crossing the artwork into two wall remainders and an independently operable door. It does not attempt to infer a door from gaps between separate obstruction segments. Multi-point or genuinely curved paths, closed polygons, multiple intersections, tiny wall remainders, and obstructions with dependent attachments are rejected without modifying the original.

New split items inherit the predecessor's style, layer, transforms, locking, attachment configuration, and unrelated metadata. For a valid Smoke door, opening sets both `doorOpen` and `disabled`, while closing removes both canonical door-state flags.

## Development

```sh
pnpm install
pnpm dev
```

Install `http://localhost:5173/manifest-local.json` in an Owlbear Rodeo development room. Run `pnpm build` for a production build.

By default, players can operate unlocked doors from the DoorJam tool, context menu, or extension panel. GMs can lock individual doors and can disable player door operation for the entire scene from the DoorJam tool menu.

While the DoorJam tool is active for the GM, each configured door displays centered lock and Dynamic Fog link status glyphs. Double-click the lock glyph to toggle the door lock. Double-click the linked glyph to unlink it; double-click the unlinked glyph to link a nearby Dynamic Fog door or create one along an intersecting fog edge when no door is in range.

The production extension is hosted at `https://doorjam.ex-asperis.com`. Install it in Owlbear Rodeo using `https://doorjam.ex-asperis.com/manifest.json` (or the version-pinned `manifest-v0.14.0.json`).

Private fog-provider metadata is isolated in `src/dynamicFog/adapter.ts` and `src/smoke/adapter.ts`. Stage Manager communication is isolated in `src/stageManager/adapter.ts` and uses only its public request/result API.
