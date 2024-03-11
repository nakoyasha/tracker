import { DiscordBranch } from "./DiscordBranch";
import { Experiment } from "./Experiments";

export type BuildData = {
  BuildNumber: string,
  VersionHash: string,
  Date: Date,
  Branch: DiscordBranch,
  Strings: string,
  // Strings: String,
  Experiments: Map<string, Experiment>,
  Scripts: {
    Initial: Array<string>,
    Lazy: Array<string>
  }
};
