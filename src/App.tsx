import { useEffect, useState } from "react";
import { DoorRow } from "./components/DoorRow";
import { StatusPanel } from "./components/StatusPanel";
import { EXTENSION_NAME } from "./constants";
import { doorStateErrorMessage, setLinkedDoorState } from "./doorJam/control";
import { clearDoorHighlight } from "./doorJam/highlight";
import { useDoorJamDoors, type DoorListEntry } from "./hooks/useDoorJamDoors";
import { useOwlbear } from "./hooks/useOwlbear";
import { RELEASE_VERSION } from "./version";

export default function App() {
  const { status, role, sceneReady, error, refreshing, refresh } = useOwlbear();
  const doorList = useDoorJamDoors(status === "ready" && role === "GM", sceneReady);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  useEffect(() => () => { void clearDoorHighlight(); }, []);
  useEffect(() => { if (role !== "GM" || !sceneReady) void clearDoorHighlight(); }, [role, sceneReady]);

  if (status === "connecting") {
    return <StatusPanel title="Connecting to Owlbear Rodeo" message="Waiting for the room SDK to become ready…" />;
  }

  if (status === "error") {
    return <StatusPanel title="Extension unavailable" message={error ?? "Unable to initialize the extension."} onRetry={() => void refresh()} />;
  }

  if (role !== "GM") return <StatusPanel title="GM only" message="DoorJam controls are available only to the Game Master." />;

  const toggleDoor = async (door: DoorListEntry) => {
    if (!door.state) return;
    setBusyId(door.id);
    setMessages((current) => ({ ...current, [door.id]: "" }));
    const result = await setLinkedDoorState(door.id, door.state === "closed");
    if (!result.ok) setMessages((current) => ({ ...current, [door.id]: doorStateErrorMessage(result.reason) }));
    await doorList.refresh();
    setBusyId(null);
  };

  return <main className="app-shell">
    <header className="panel-header">
      <div><span className="eyebrow">GM door controls</span><h1>{EXTENSION_NAME}</h1></div>
      <button className="secondary-button" disabled={refreshing || doorList.loading} onClick={() => void doorList.refresh()}>{refreshing || doorList.loading ? "Refreshing…" : "Refresh"}</button>
    </header>
    {!sceneReady && <div className="notice" role="status">Open a scene to control DoorJam doors.</div>}
    {sceneReady && doorList.error && <div className="notice error-notice" role="alert">{doorList.error}</div>}
    {sceneReady && !doorList.error && doorList.loading && doorList.doors.length === 0 && <div className="empty-state">Loading doors…</div>}
    {sceneReady && !doorList.error && !doorList.loading && doorList.doors.length === 0 && <div className="empty-state">No linked DoorJam doors in this scene.<span>Place and link a door image using its context menu.</span></div>}
    {sceneReady && doorList.doors.length > 0 && <ul className="door-list" aria-label="Linked DoorJam doors">
      {doorList.doors.map((door) => <DoorRow key={door.id} door={door} busy={busyId === door.id} message={messages[door.id]} onRename={doorList.renameDoor} onToggle={toggleDoor} />)}
    </ul>}
    <footer>DoorJam {RELEASE_VERSION}</footer>
  </main>;
}
