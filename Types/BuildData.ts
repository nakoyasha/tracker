import { DiscordBranch } from "./DiscordBranch";

export type BuildData = {
  BuildNumber: string,
  VersionHash: string,
  Date: Number,
  Branch: DiscordBranch,
  Strings: Map<string, string>,
  // Strings: String,
  Experiments: Map<string, string>,
  Scripts: {
    Initial: Map<string, string>,
    Lazy: Map<string, string>
  }
};
