import { Mongoose, Schema, model } from "mongoose";
import { BuildData } from "../Types/BuildData"

import { Experiment } from "../Types/Experiments";

export const BuildSchema = new Schema<BuildData>({
  BuildNumber: String,
  VersionHash: String,
  Date: Number,
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
});

export const BuildModel = model("Build", BuildSchema, "DiscordBuilds");
