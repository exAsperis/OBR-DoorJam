# DoorJam

DoorJam links ordinary Owlbear Rodeo image items to doors created by the official Dynamic Fog extension. Dynamic Fog remains authoritative; DoorJam mirrors its open/closed state with configured artwork.

## GM workflow

1. Place closed-door artwork over an existing Dynamic Fog door.
2. Select or right-click the image and choose **Link to Dynamic Fog Door**.
3. Choose **Set Open Door Image** and select the matching asset from Owlbear's image picker.
4. Use **Open Door** or **Close Door** on the image.

DoorJam automatically mirrors changes made through Dynamic Fog itself. Use **Relink Dynamic Fog Door** if the underlying fog item or door index changes, or **Unlink DoorJam Door** to remove only DoorJam metadata.

## Development

```sh
pnpm install
pnpm dev
```

Install `http://localhost:5173/manifest-local.json` in an Owlbear Rodeo development room. Run `pnpm build` for a production build.

The production extension is hosted at `https://doorjam.ex-asperis.com`. Install it in Owlbear Rodeo using `https://doorjam.ex-asperis.com/manifest.json` (or the version-pinned `manifest-v0.1.0.json`).

The private Dynamic Fog metadata key `rodeo.owlbear.dynamic-fog/doors` is isolated in `src/dynamicFog/adapter.ts`. Dynamic Fog does not expose a formal door API, so future representation changes should require updates only in that adapter and its geometry helper.
