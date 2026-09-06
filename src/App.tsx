import { StatusPanel } from "./components/StatusPanel";
import { EXTENSION_NAME } from "./constants";
import { useOwlbear } from "./hooks/useOwlbear";
import { useDoorJamStatus } from "./hooks/useDoorJamStatus";

export default function App() {
  const { status, role, playerName, sceneReady, error, refreshing, refresh } = useOwlbear();
  const doorStatus = useDoorJamStatus(status === "ready" && role === "GM" && sceneReady);

  if (status === "connecting") {
    return <StatusPanel title="Connecting to Owlbear Rodeo" message="Waiting for the room SDK to become ready…" />;
  }

  if (status === "error") {
    return <StatusPanel title="Extension unavailable" message={error ?? "Unable to initialize the extension."} onRetry={() => void refresh()} />;
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="title-row">
          <div>
            <span className="eyebrow">Owlbear Rodeo extension</span>
            <h1>{EXTENSION_NAME}</h1>
          </div>
          <button className="secondary-button" disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <p className="intro">Put closed-door art over a Dynamic Fog door, select it, then choose <strong>Link to Dynamic Fog Door</strong>.</p>
      </section>

      <section className="content-card" aria-labelledby="room-state-heading">
        <span className="eyebrow">Scene status</span>
        <h2 id="room-state-heading">DoorJam at a glance</h2>
        <dl className="facts">
          <div><dt>Dynamic Fog doors</dt><dd>{doorStatus.dynamicFogDoors}</dd></div>
          <div><dt>Linked images</dt><dd>{doorStatus.linkedImages}</dd></div>
          <div><dt>Invalid links</dt><dd>{doorStatus.invalidLinks}</dd></div>
        </dl>
        {role !== "GM" && <div className="notice" role="status">DoorJam setup and controls are currently GM-only.</div>}
        {role === "GM" && !sceneReady && <div className="notice" role="status">Open a scene to inspect Dynamic Fog doors.</div>}
        {role === "GM" && sceneReady && doorStatus.dynamicFogDoors === 0 && <div className="notice" role="status">No valid Dynamic Fog doors found. Make sure Dynamic Fog is active and doors exist.</div>}
        {doorStatus.invalidLinks > 0 && <div className="notice" role="status">Select invalid DoorJam images and use <strong>Relink Dynamic Fog Door</strong>.</div>}
        <button className="secondary-button" disabled={doorStatus.loading || !sceneReady} onClick={() => void doorStatus.refresh()}>{doorStatus.loading ? "Checking…" : "Check scene"}</button>
      </section>

      <footer>{playerName || "Unnamed player"} · {role ?? "Unknown role"} · DoorJam 0.1.0</footer>
    </main>
  );
}
