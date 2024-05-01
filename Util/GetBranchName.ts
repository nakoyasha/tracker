import { DiscordBranch } from "../Types/DiscordBranch";

export default function getBranchName(branch: DiscordBranch) {
  switch (branch) {
    case DiscordBranch.Stable:
      return "stable"
    case DiscordBranch.Canary:
      return "canary"
    case DiscordBranch.PTB:
      return "ptb"
  }
}