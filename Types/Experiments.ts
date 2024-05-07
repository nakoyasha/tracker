import { ExperimentBucketOverride, ExperimentPopulation } from "..";

export type GuildExperiment = {
  hash: number,
  hash_key: string,
  revision: number,
  populations: ExperimentPopulation[]
  overrides: ExperimentBucketOverride[],
  overrides_formatted: ExperimentPopulation[][]
  holdout_name?: string;
  holdout_bucket?: number,
  aa_mode: boolean,
}

export enum ExperimentType {
  User = "user",
  Guild = "guild",
  None = "none",
}

export type Experiment = {
  hash_key: string,
  name: string,
  // The 32-bit hash of the experiment name
  hash: number,
  buckets: number[],
  // The names for the buckets (aka treatments)
  description: string[],
  title: string,
  // backwards compat
  type: ExperimentType | string,
  assignment?: UserExperimentAssignment | GuildExperiment,
  // The requester's rollout position in the experiment.
  revision?: number,
  rollout_position?: number,
  aa_mode?: boolean,
}

export type MinExperiment = {
  hash_key?: string,
  name: string,
  // The 32-bit hash of the experiment name
  hash: number,
  buckets: number[],
  // The names for the buckets (aka treatments)
  description: string[],
  title: string,
  // backwards compat
  type: ExperimentType | string,
}

export type Experiments = {
  assignments: UserExperimentAssignment[],
  experiments: GuildExperiment[],
}

export type UserExperimentAssignment = {
  hash: number,
  // TODO: implement getting the hash key lmao
  hash_key?: string,
  revision: number,
  bucket: number | -1,
  override: number,
  population: number,
  hash_result: number,
  aa_mode: boolean,
}