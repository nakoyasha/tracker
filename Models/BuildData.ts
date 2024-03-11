import { Schema, model } from "mongoose";
import { BuildData } from "../Types/BuildData"

export const BuildSchema = new Schema<BuildData>({
  BuildNumber: String,
  VersionHash: String,
  Date: Number,
  // TODO: propery store strings and experiments
  Strings: {
    type: Map,
    of: String,
  },
  Experiments: {
    type: Map,
    of: String,
  },
  Branch: String,
  Scripts: {
    Initial: {
      type: Map,
      of: String,
    },
    Lazy: {
      type: Map,
      of: String,
    }
  }
});

export const BuildModel = model("Build", BuildSchema, "MizukiBuilds");
