import { Schema, model } from "mongoose";
import { Experiment } from "../Types/Experiments";

export const ExperimentSchema = new Schema<Experiment>({
    type: {
        type: String,
        enum: ["user", "guild"],
        required: true,
    },
    hash_key: String,
    hash: String,
    title: String,
    name: String,
    description: Array,
    buckets: Array,
    revision: Number,
    rollout_position: Number,
    aa_mode: Boolean
});

export const ExperimentsSchema = new Schema<Map<string, Experiment>>()
export const ExperimentsModel = model("Experiments", ExperimentsSchema)
export const ExperimentModel = model("Experiment", ExperimentSchema);
