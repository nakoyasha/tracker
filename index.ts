// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { PuppeteerPull } from "./Parsers/Experiments/PuppeteerPull";
import Logger from "./Logger"
import { DiscordBranch } from "./Types/DiscordBranch"
import { ExperimentPopulationRange } from "./Types/ExperimentRanges";
import { ExperimentPopulationFilters } from "./Types/ExperimentFilters";
import { Snowflake } from "./Types/Snowflake";
import { Experiment, Experiments, GuildExperiment, UserExperimentAssignment } from "./Types/Experiments";
import { ClientScript } from "./ClientScriptsPuller";
import { ASTParser } from "./Parsers/ASTParser";
import { ASTExperiments } from "./Parsers/Experiments/ASTExperiments";

const logger = new Logger("Util/PullExperimentData")

export type ExperimentPopulation = {
  ranges: ExperimentPopulationRange[],
  filters: ExperimentPopulationFilters,
}

export type ExperimentBucketOverride = {
  // Bucket assigned to these resouces
  b: number,
  // Resources granted access to this bucket 
  k: Snowflake[]
}

export type ExperimentsHttpResult = {
  fingerprint?: string
  assignments: UserExperimentAssignment[];
  guild_experiments: GuildExperiment[];
}


function processEdgeOFPopulationRange(WeirdBucket: any[]) {
  const bucket = WeirdBucket[0]
  const ranges = WeirdBucket[1][0]

  return {
    bucket: bucket as number,
    rollout: {
      s: ranges.s as number,
      e: ranges.e as number,
    },
  }
}

function processPopulationRange(PopulationRange: any[]) {
  const bucket = PopulationRange?.[0]
  const ranges = PopulationRange?.[1]

  if (bucket instanceof Object && ranges == undefined) {
    return processEdgeOFPopulationRange(bucket)
  }

  return {
    bucket: bucket as number,
    rollout: {
      s: PopulationRange[1][0].s as number,
      e: PopulationRange[1][0].e as number,
    },
  }
}

function processPopulationRanges(PopulationRanges: any[]) {
  const ranges = [] as any[]

  PopulationRanges.forEach(range => {
    // :airidizzy:
    ranges.push(processPopulationRange(range))
  })

  return [...ranges]
}

function processPopulationFilters(PopulationFilters: any[]) {
  const filters = PopulationFilters[0]?.[1]?.[0]
  if (filters == undefined) {
    return {}
  }
  return {
    guild_has_feature: {
      guild_features: filters?.[1]
    },
    guild_id_range: {
      min_id: filters?.[2] as Snowflake,
      max_id: filters?.[3] as Snowflake,
    },
    guild_member_count_range: {
      min_id: filters?.[4] as Snowflake,
      max_id: filters?.[5] as Snowflake,
    },
    guild_ids: {
      guild_ids: filters?.[6] as Snowflake[0]
    },
    guild_hub_types: {
      guild_hub_types: filters?.[7] as number[]
    },
    guild_has_vanity_url: {
      guild_has_vanity_url: filters?.[8] as boolean,
    },
    guild_in_range_by_hash: {
      hash_key: filters?.[9] as number,
      target: filters?.[10] as number,
    },
  }
}

function processPopulations(Populations: any[]) {
  let populations = [] as ExperimentPopulation[]

  Populations.forEach(rawPopulation => {
    let ranges = rawPopulation[0]
    let filters = rawPopulation[1]

    const data = {
      ranges: ranges != undefined && processPopulationRanges(rawPopulation[0]) || null,
      filters: filters != undefined && processPopulationFilters(rawPopulation[1]) || null
    }
    populations.push(data as any)
  })

  return populations
}

function processOverrides(Overrides: any[]) {
  let overrides = [] as ExperimentBucketOverride[]

  Overrides.forEach(rawOverride => {
    const data = {
      b: rawOverride?.[0] as number,
      k: rawOverride?.[1] as Snowflake[],
    }
    Overrides.push(data as any)
  })

  return overrides
}

function processGuildExperiment(GuildExperiment: any[]) {
  return {
    hash: GuildExperiment[0] as number,
    hash_key: GuildExperiment[1] as string,
    revision: GuildExperiment[2] as number,
    populations: processPopulations(GuildExperiment[3]),
    overrides: processOverrides(GuildExperiment[4]),
    overrides_formatted: [processPopulations(GuildExperiment[5])],
    holdout_name: GuildExperiment[6] as string,
    holdout_bucket: GuildExperiment[7] as number,
    aa_mode: Boolean(GuildExperiment[8]),
  } as GuildExperiment
}

function processUserAssignment(UserAssignment: any[]) {
  return {
    hash: UserAssignment[0],
    revision: UserAssignment[1],
    bucket: UserAssignment[2],
    override: UserAssignment[3],
    population: UserAssignment[4],
    hash_result: UserAssignment[5],
    aa_mode: Boolean(UserAssignment[6]),
  } as UserExperimentAssignment
}

export async function getGuildExperiments(branch: DiscordBranch) {
  try {
    const response = await fetch(branch + "/api/v9/experiments?with_guild_experiments=true")
    if (!response.ok) {
      throw new Error(`Failed to get guild experiments because the server returned ${response.status}`)
    }
    const body = await response.json() as ExperimentsHttpResult
    const experiments = {
      assignments: [],
      experiments: [],
    } as Experiments

    body.assignments.forEach(userAssignment => {
      const experiment = processUserAssignment(userAssignment as any)
      experiments.assignments.push(experiment)
    })

    for (let guildExperiment of body.guild_experiments) {
      const experiment = processGuildExperiment(guildExperiment as any)

      if (experiment.hash_key != null) {
        // typescript doesnt like me casting it as a string here... for some reason?
        // soo weird 
        experiments.experiments.push(experiment)
      }
    }

    return experiments
  } catch (err) {
    logger.error(`Error while pulling guild experiments: ${err}`)
    throw err;
  }
}

// Performs a (proper) pull on client experiments, which results in hash_key, and the proper name being available.
// ast - fast
// puppeter - slow
export async function getClientExperiments(type: "puppeteer" | "ast", branch: DiscordBranch = DiscordBranch.Stable, scripts?: ClientScript[]) {
  switch (type) {
    case "puppeteer":
      return new PuppeteerPull().getClientExperiments(branch)
    case "ast":
      if (scripts === undefined) {
        return;
      }

      const parser = new ASTParser([
        new ASTExperiments()
      ])

      await parser.parse(scripts)
      const experiments = parser.getResult<Experiment[]>("experiments")

      return experiments;
  }
}

