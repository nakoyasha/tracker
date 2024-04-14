import type { Diff } from "./Diff";
import { DiscordBranch } from "./DiscordBranch";
import { Experiment } from "./Experiments";

export type LegacyBuildData = {
  BuildNumber: string,
  VersionHash: string,
  Date: Date,
  Branch: DiscordBranch,
  Strings: string,
  Experiments: Map<string, Experiment>,
  Scripts: {
    Initial: Array<string>,
    Lazy: Array<string>
  }
};

export enum BuildFlags {
  NeedsStringRediff = "needs-string-rediff",
  NeedsExperimentFetch = "needs-experiment-fetch",
  NeedsScriptFetch = "needs-script-fetch"
}

export type BuildData = {
  build_number: number,
  build_hash: string,
  date_found: Date,
  branches: DiscordBranch[],
  Branch?: string,
  strings_diff: Diff[],
  experiments: Map<string, Experiment>,
  diff_against?: String,
  flags: BuildFlags[],
  // Legacy field; ignore!
  strings?: Map<string, string>,
  scripts: {
    initial: Array<string>,
    lazy: Array<string>
  }
};
