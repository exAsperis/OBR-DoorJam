import { EXTENSION_ID } from "../constants";

export const DOORJAM_TOOL_ID = `${EXTENSION_ID}/tool`;
export const modeId = (action: string) => `${DOORJAM_TOOL_ID}/${action}`;
