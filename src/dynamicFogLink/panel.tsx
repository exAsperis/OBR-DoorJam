import OBR, { isImage } from "@owlbear-rodeo/sdk";
import { useEffect, useState } from "react";
import { createAndLinkDoor } from "../doorJam/linking";
import { DYNAMIC_FOG_LINK_CHOICE_CHANNEL, DYNAMIC_FOG_LINK_POPOVER_ID } from "../doorJam/dynamicFogLinkPopover";
import { openDoorImagesPopover } from "../doorJam/imagesPopover";
import { applyOwlbearTheme } from "../theme";

export function DynamicFogLinkPanel() {
  const params = new URLSearchParams(location.search); const imageId = params.get("imageId") ?? ""; const reason = params.get("reason") ?? "none";
  const [busy, setBusy] = useState(false);
  useEffect(() => { let remove: (() => void) | undefined; OBR.onReady(async () => { applyOwlbearTheme(await OBR.theme.getTheme()); remove = OBR.theme.onChange(applyOwlbearTheme); }); return () => remove?.(); }, []);
  const select = async () => { setBusy(true); await OBR.broadcast.sendMessage(DYNAMIC_FOG_LINK_CHOICE_CHANNEL, { imageId, choice: "select", reason }, { destination: "LOCAL" }); await OBR.popover.close(DYNAMIC_FOG_LINK_POPOVER_ID); };
  const create = async () => {
    setBusy(true); const image = (await OBR.scene.items.getItems([imageId]))[0];
    if (!image || !isImage(image)) { await OBR.notification.show("The DoorJam image no longer exists.", "ERROR"); return; }
    const result = await createAndLinkDoor(image);
    if (!result.ok) await OBR.notification.show(result.message, "ERROR");
    else { await OBR.notification.show(result.warning ? "Door created and linked, but its initial state could not be synchronized." : "New Dynamic Fog door created. Door image linked.", result.warning ? "ERROR" : "DEFAULT"); if (result.needsOpenArtwork) await openDoorImagesPopover(image.id); }
    await OBR.popover.close(DYNAMIC_FOG_LINK_POPOVER_ID);
  };
  const ambiguous = reason.startsWith("ambiguous");
  return <main className="choice-panel"><header><span>DoorJam</span><h1>Link Dynamic Fog</h1></header>
    <p>{ambiguous ? "More than one existing door is plausible. Select the intended door." : "No existing door was matched confidently. Choose what to do next."}</p>
    <button disabled={busy} onClick={() => void select()}>Select Existing Door</button>
    {!ambiguous && <button disabled={busy} onClick={() => void create()}>Create New Door</button>}
    <button className="cancel" disabled={busy} onClick={() => void OBR.popover.close(DYNAMIC_FOG_LINK_POPOVER_ID)}>Cancel</button>
  </main>;
}
