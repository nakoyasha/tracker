import { DiscordBranch } from "../Types/DiscordBranch"

export function getURLForBranch(branch: DiscordBranch): string | undefined {
  const DISCORD_URL = "https://discord.com";
  const PTB_DISCORD_URL = "https://ptb.discord.com";
  const CANARY_DISCORD_URL = "https://canary.discord.com";

  if (branch == "stable") {
    return DISCORD_URL
  } else if (branch == "canary") {
    return CANARY_DISCORD_URL
  } else if (branch == "ptb") {
    return PTB_DISCORD_URL
  }
}