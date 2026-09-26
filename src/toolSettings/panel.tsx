import OBR from "@owlbear-rodeo/sdk";
import { useEffect, useState } from "react";
import { applyOwlbearTheme } from "../theme";
import { DOORJAM_TOOL_PREFERENCES_KEY } from "../constants";
import { DOORJAM_TOOL_ID, modeId } from "../tool/ids";
import { DEFAULT_TOOL_PREFERENCES, getToolPreferences, readToolPreferences, setToolPreferences, type DoorJamToolPreferences } from "../tool/preferences";
import { TOOL_SETTINGS_POPOVER_ID } from "../tool/settingsPopover";

export function ToolSettingsPanel() {
  const [preferences, setPreferences] = useState<DoorJamToolPreferences>(DEFAULT_TOOL_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    let removeTheme: (() => void) | undefined;
    let removePlayer: (() => void) | undefined;
    OBR.onReady(async () => {
      applyOwlbearTheme(await OBR.theme.getTheme());
      if (!mounted) return;
      removeTheme = OBR.theme.onChange(applyOwlbearTheme);
      setPreferences(await getToolPreferences());
      setReady(true);
      removePlayer = OBR.player.onChange((player) => {
        if (mounted) setPreferences(readToolPreferences(player.metadata));
      });
    });
    return () => { mounted = false; removeTheme?.(); removePlayer?.(); };
  }, []);

  const toggle = async (key: keyof DoorJamToolPreferences) => {
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    await setToolPreferences(next);
    await OBR.tool.setMetadata(DOORJAM_TOOL_ID, { [DOORJAM_TOOL_PREFERENCES_KEY]: next });
    const activeMode = await OBR.tool.getActiveToolMode();
    if ((!next.dynamicFog && activeMode === modeId("editDynamicFog")) ||
        (!next.dynamicFog && activeMode === modeId("link")) ||
        (!next.smoke && activeMode === modeId("linkSmoke")) ||
        (!next.stageManager && activeMode === modeId("linkStageManager"))) {
      await OBR.tool.activateMode(DOORJAM_TOOL_ID, modeId("operate"));
    }
  };

  if (!ready) return <main className="tool-settings status">Loading settings…</main>;
  const row = (key: keyof DoorJamToolPreferences, title: string, description: string) => <label className="setting-row">
    <span><strong>{title}</strong><small>{description}</small></span>
    <input type="checkbox" role="switch" checked={preferences[key]} onChange={() => void toggle(key)} aria-label={`Show ${title} tools`} />
  </label>;
  return <main className="tool-settings" aria-label="DoorJam tool settings">
    <header><span>DoorJam</span><h1>Tool Settings</h1></header>
    {row("dynamicFog", "Dynamic Fog", "Link, create, and edit tools")}
    {row("smoke", "Smoke & Spectre!", "Link and create tools")}
    {row("stageManager", "Stage Manager", "Link Elevator tools")}
    <button type="button" className="close-button" onClick={() => void OBR.popover.close(TOOL_SETTINGS_POPOVER_ID)}>Close</button>
  </main>;
}
