import { Schema, model } from "mongoose";
import { BuildData } from "../Types/BuildData"
import { Experiment } from "../Types/Experiments";

import { ClientScript } from "../ClientScriptsPuller"


export const BuildSchema = new Schema<BuildData>({
  build_number: Number,
  build_hash: String,
  date_found: Date,
  built_on: Date,
  experiments: {
    type: Map<string, Experiment>,
    required: true,
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
  schema_version: Number,
  scripts: {
    initial: {
      type: Array<ClientScript>
    },
    lazy: {
      type: Array<ClientScript>
    }
  }
});

export const BuildModel = model("Build", BuildSchema, "DiscordBuilds");
// export const LegacyBuildModel = model("LegacyBuild", LegacyBuildSchema, "DiscordBuilds")
