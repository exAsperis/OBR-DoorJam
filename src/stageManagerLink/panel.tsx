import OBR, { isImage } from "@owlbear-rodeo/sdk";
import { useEffect, useState } from "react";
import { clearDoorHighlight, showDoorHighlight } from "../doorJam/highlight";
import { applyOwlbearTheme } from "../theme";
import { listStageManagerElevators } from "../stageManager/adapter";
import { finishStageManagerLink, rankElevatorCandidates, unlinkStageManagerElevator, type ElevatorCandidate } from "../stageManager/linking";
import { STAGE_MANAGER_LINK_POPOVER_ID } from "../stageManager/linkPopover";
import { readDoorJamMetadata } from "../doorJam/metadata";

export function StageManagerLinkPanel() {
  const imageId = new URLSearchParams(location.search).get("imageId") ?? "";
  const [candidates, setCandidates] = useState<ElevatorCandidate[]>([]);
  const [message, setMessage] = useState("Loading Elevators…");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    let active = true; let removeTheme: (() => void) | undefined;
    OBR.onReady(async () => {
      applyOwlbearTheme(await OBR.theme.getTheme()); removeTheme = OBR.theme.onChange(applyOwlbearTheme);
      const door = (await OBR.scene.items.getItems([imageId]))[0];
      const listed = await listStageManagerElevators();
      if (!active) return;
      if (!door || !isImage(door)) return setMessage("The DoorJam image no longer exists.");
      setSelected([...(readDoorJamMetadata(door)?.links?.stageManager?.itemIds ?? [])]);
      if (!listed.ok) return setMessage(listed.message);
      const ranked = await rankElevatorCandidates(door, listed.value);
      if (!active) return;
      setCandidates(ranked); setMessage(ranked.length ? "" : "No Stage Manager Elevators are configured in this scene.");
    });
    return () => { active = false; removeTheme?.(); void clearDoorHighlight(); };
  }, [imageId]);
  const select = async (candidate: ElevatorCandidate) => {
    setBusy(true);
    if (selected.includes(candidate.itemId)) {
      if (await unlinkStageManagerElevator(imageId, candidate.itemId))
        setSelected((current) => current.filter((itemId) => itemId !== candidate.itemId));
      setMessage(""); setBusy(false); return;
    }
    const result = await finishStageManagerLink(imageId, candidate.itemId);
    if (!result.ok) { setMessage(result.message); setBusy(false); return; }
    setSelected((current) => [...new Set([...current, candidate.itemId])]);
    setMessage(result.warning ? "Linked, but Stage Manager could not update this Elevator." : "");
    setBusy(false);
  };
  return <main className="link-panel"><header><span>DoorJam</span><h1>Link Stage Manager Elevator</h1></header>
    {message && <p role="status">{message}</p>}
    <div className="candidates">{candidates.map((candidate) => <button disabled={busy} key={candidate.itemId} aria-pressed={selected.includes(candidate.itemId)} className={selected.includes(candidate.itemId) ? "selected" : ""}
      onPointerEnter={() => void showDoorHighlight(candidate.itemId)} onPointerLeave={() => void clearDoorHighlight()}
      onFocus={() => void showDoorHighlight(candidate.itemId)} onBlur={() => void clearDoorHighlight()}
      onClick={() => void select(candidate)}>
      <strong>{candidate.self ? "This Door · " : ""}{candidate.name}</strong>
      <small>{candidate.disabled ? "Disabled" : "Enabled"}{!candidate.self && !candidate.overlaps && Number.isFinite(candidate.distance) ? ` · ${Math.round(candidate.distance)}px away` : candidate.overlaps ? " · Overlapping" : ""}</small>
    </button>)}</div>
    <button className="cancel" onClick={() => void OBR.popover.close(STAGE_MANAGER_LINK_POPOVER_ID)}>Close</button>
  </main>;
}
