import OBR from "@owlbear-rodeo/sdk";
import { EXTENSION_ID } from "../constants";

export const TOOL_SETTINGS_ACTION_ID = `${EXTENSION_ID}/tool/settings`;
export const TOOL_SETTINGS_POPOVER_ID = `${EXTENSION_ID}/tool-settings-popover`;

export async function openToolSettingsPopover(anchorElementId: string): Promise<void> {
  await OBR.popover.close(TOOL_SETTINGS_POPOVER_ID).catch(() => undefined);
  await OBR.popover.open({
    id: TOOL_SETTINGS_POPOVER_ID,
    url: "/tool-settings.html",
    width: 320,
    height: 242,
    anchorReference: "ELEMENT",
    anchorElementId,
    anchorOrigin: { horizontal: "RIGHT", vertical: "TOP" },
    transformOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
  });
}
