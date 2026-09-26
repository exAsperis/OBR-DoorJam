import OBR from "@owlbear-rodeo/sdk";
import { useEffect, useState } from "react";
import { breakDoorLink } from "../doorJam/breakLink";
import { BREAK_LINK_POPOVER_ID } from "../doorJam/breakLinkPopover";
import { getDoorLinkKinds, readDoorJamMetadata, type DoorLinkKind } from "../doorJam/metadata";
import { INTEGRATION_NAMES } from "../doorJam/providers";
import { applyOwlbearTheme } from "../theme";
export function BreakLinkPanel() {
  const imageId = new URLSearchParams(location.search).get("imageId") ?? "";
  const [kinds, setKinds] = useState<DoorLinkKind[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; let remove: (() => void) | undefined; OBR.onReady(async () => {
    applyOwlbearTheme(await OBR.theme.getTheme()); remove = OBR.theme.onChange(applyOwlbearTheme);
    const item = (await OBR.scene.items.getItems([imageId]))[0]; const metadata = item ? readDoorJamMetadata(item) : null;
    if (active) setKinds(metadata ? getDoorLinkKinds(metadata) : []);
  }); return () => { active = false; remove?.(); }; }, [imageId]);
  const choose = async (kind: DoorLinkKind) => { setBusy(true); await breakDoorLink(imageId, kind); await OBR.popover.close(BREAK_LINK_POPOVER_ID); };
  return <main className="break-panel"><h1>Break Link</h1><p>Which connection do you want to remove?</p>
    {kinds.map((kind) => <button disabled={busy} key={kind} onClick={() => void choose(kind)}>{INTEGRATION_NAMES[kind]}</button>)}
    <button className="cancel" onClick={() => void OBR.popover.close(BREAK_LINK_POPOVER_ID)}>Cancel</button>
  </main>;
}
