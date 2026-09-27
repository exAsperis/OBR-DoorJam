import { Command, type PathCommand } from "@owlbear-rodeo/sdk";
const n = (value: number) => Number(value.toFixed(3));
export function pathCommandsToSvgD(commands: PathCommand[]): string {
  return commands.map((command) => {
    switch (command[0]) {
      case Command.MOVE: return `M ${n(command[1])} ${n(command[2])}`;
      case Command.LINE: return `L ${n(command[1])} ${n(command[2])}`;
      case Command.QUAD: return `Q ${n(command[1])} ${n(command[2])} ${n(command[3])} ${n(command[4])}`;
      case Command.CONIC: return `Q ${n(command[1])} ${n(command[2])} ${n(command[3])} ${n(command[4])}`;
      case Command.CUBIC: return `C ${n(command[1])} ${n(command[2])} ${n(command[3])} ${n(command[4])} ${n(command[5])} ${n(command[6])}`;
      case Command.CLOSE: return "Z";
    }
  }).join(" ");
}
