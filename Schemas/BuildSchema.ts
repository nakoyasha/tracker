import { Schema, model } from "mongoose";
import { BuildData, LegacyBuildData } from "../Types/BuildData"
import { Experiment } from "../Types/Experiments";

export const LegacyBuildSchema = new Schema<LegacyBuildData>({
  BuildNumber: String,
  VersionHash: String,
  Date: Date,
  Experiments: {
    type: Map<string, Experiment>,
    required: true,
  },
  Strings: {
    type: String,
    required: true
  },
  Branch: String,
  Scripts: {
    Initial: [String],
    Lazy: [String],
  }
})

export const BuildSchema = new Schema<BuildData>({
  build_number: Number,
  build_hash: String,
  date_found: Date,
  built_on: Date,
  experiments: {
    type: Map<string, Experiment>,
    required: true,
  },
  strings: {
    type: Map<string, string>,
    required: false,
  },
  strings_diff: [
    {
      type: {
        type: String,
        enum: ["added", "removed", "changed"],
        required: true,
      },
      key: String,
      value: String,
      newValue: String,
      oldValue: String,
    }
  ],
  flags: [{
    type: String,
    enum: ["needs-string-rediff", "needs-experiment-fetch", "needs-script-fetch", "needs-recounting"],
    required: false,
  }],
  counts: {
    strings: Number,
    experiments: Number,
  },
  branches: [String],
  diff_against: {
    type: String,
    // if it doesn't exist, we just diff against the latest build.
    // TODO: the above is a terrible idea soo find a way to get the previous build 
    // maybe loop thru every build and find the first one that has a lower build number?
    required: false,
  },
  scripts: {
    initial: [String],
    lazy: [String],
  }
});

export const BuildModel = model("Build", BuildSchema, "DiscordBuilds");
export const LegacyBuildModel = model("LegacyBuild", LegacyBuildSchema, "DiscordBuilds")
