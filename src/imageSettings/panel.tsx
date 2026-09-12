import OBR, { isImage, type Image } from "@owlbear-rodeo/sdk";
import { useEffect, useState } from "react";
import { chooseDoorArtwork, swapDoorArtwork } from "../doorJam/artwork";
import { readDoorJamMetadata } from "../doorJam/metadata";
import { applyOwlbearTheme } from "../theme";

export function ImageSettingsPanel({ targetImageId }: { targetImageId?: string | null } = {}) {
  const imageId = targetImageId === undefined ? new URLSearchParams(window.location.search).get("imageId") : targetImageId;
  const [image, setImage] = useState<Image | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<"open" | "closed" | "swap" | null>(null);

  const refresh = async () => {
    if (!imageId || !(await OBR.scene.isReady()) || await OBR.player.getRole() !== "GM") {
      setImage(null);
      setReady(true);
      return;
    }
    const [item] = await OBR.scene.items.getItems([imageId]);
    setImage(item && isImage(item) ? item : null);
    setReady(true);
  };

  useEffect(() => {
    let active = true;
    let removeTheme: (() => void) | undefined;
    let removeItems: (() => void) | undefined;
    let removeReady: (() => void) | undefined;
    OBR.onReady(async () => {
      if (!active) return;
      applyOwlbearTheme(await OBR.theme.getTheme());
      if (!active) return;
      removeTheme = OBR.theme.onChange(applyOwlbearTheme);
      removeItems = OBR.scene.items.onChange(() => void refresh());
      removeReady = OBR.scene.onReadyChange(() => void refresh());
      await refresh();
    });
    return () => { active = false; removeTheme?.(); removeItems?.(); removeReady?.(); };
  }, []);

  if (!ready) return <main className="images-status">Loading images…</main>;
  if (!image) return <main className="images-status">This door image is no longer available.</main>;

  const metadata = readDoorJamMetadata(image);
  const openUrl = metadata?.openImage?.image.url;
  const closedUrl = metadata?.closedImage.image.url ?? image.image.url;
  const select = async (state: "open" | "closed") => {
    setBusy(state);
    try {
      if (await chooseDoorArtwork(image.id, state)) await refresh();
    } finally {
      setBusy(null);
    }
  };
  const swap = async () => {
    setBusy("swap");
    try {
      if (await swapDoorArtwork(image.id)) await refresh();
    } finally {
      setBusy(null);
    }
  };

  const frame = (state: "open" | "closed", url: string | undefined) => <section className="image-field">
    <h2>{state === "open" ? "Open" : "Closed"}</h2>
    <div className="image-frame">
      {url ? <img src={url} alt={`${state} door artwork`} /> : <span>No image set</span>}
    </div>
    <button type="button" disabled={busy !== null} aria-label={`Set ${state} door image`} onClick={() => void select(state)}>
      {busy === state ? "Selecting…" : "Set Image"}
    </button>
  </section>;

  return <main className="images-panel" aria-label="Door images">
    {frame("open", openUrl)}
    {frame("closed", closedUrl)}
    <button
      type="button"
      className="swap-button"
      aria-label="Swap open and closed door images"
      title="Swap open and closed door images"
      disabled={busy !== null || !openUrl || !closedUrl}
      onClick={() => void swap()}
    >⇄</button>
  </main>;
}
