import {
  ScriptFlags,
  pullClientScripts
} from "../ClientScriptsPuller"
import murmurhash from "murmurhash"
import { BuildData, BuildFlags } from "../Types/BuildData"
import Logger from "../Logger"
import { DiscordBranch } from "../Types/DiscordBranch"
import { Experiment, GuildExperiment } from "../Types/Experiments"
import { ASTParser } from "../Parsers/ASTParser"
import { ASTStringsPlugin } from "../Parsers/Strings"
import { ASTClientInfoPlugin, ClientInfo } from "../Parsers/ClientInfo"
import assert from "node:assert"
import { getGuildExperiments } from "../index"
import { makeBuildDiff } from "../Parsers/Diff/MakeBuildDiff"
import { ASTExperiments } from "../Parsers/Experiments/ASTExperiments"

const logger = new Logger("Util/CompileBuildData");

export async function compileBuildData(branch: DiscordBranch = DiscordBranch.Stable, overrideUrl?: string, lastBuild?: BuildData): Promise<BuildData> {
  logger.log("Fetching initial scripts...")
  const scripts = await pullClientScripts("full", branch, overrideUrl)

  if (scripts === undefined) {
    logger.error("Failed to fetch initial scripts");
    throw new Error("Failed to fetch initial scripts")
  }

  let initialScripts = scripts.initial
  let lazyScripts = scripts.lazy

  logger.log("Fetching experiments..")
  let experiments = await getGuildExperiments(branch)
  const guildExperiments = experiments.experiments

  const parser = new ASTParser([
    new ASTStringsPlugin(),
    new ASTExperiments(),
    new ASTClientInfoPlugin(),
  ])

  const languageObjectScript = initialScripts.find(script => script.flags.includes(ScriptFlags.LanguageObject))
  const clientInfoScript = initialScripts.find(script => script.flags.includes(ScriptFlags.ClientInfo))

  if (languageObjectScript === undefined) {
    logger.error("Compile error: Could not find any script wit the language_object flag!")
    throw new Error("LanguageObject could not be found");
  }

  if (clientInfoScript === undefined) {
    logger.error("Compile error: Could not find any script wit the client_info flag!")
    throw new Error("ClientInfo could not be found");
  }
  await parser.parse([...lazyScripts, ...initialScripts])
  const clientInfo = parser.getResult<ClientInfo>("client-info")
  const strings = parser.getResult<Map<string, string>>("strings")
  const userExperiments = parser.getResult<Experiment[]>("experiments") || []

  assert(clientInfo.build_number != undefined, "Compile error: Couldn't find buildNumber!")
  assert(clientInfo.build_hash != undefined, "Compile error: Couldn't find buildHash!")
  assert(clientInfo.built_at != undefined, "Compile error: Couldn't find builtAt!")

  logger.log(`Compiling experiments..`)
  const mappedExperiments = new Map<string, Experiment>() as Map<string, Experiment>

  const arrayUserExperiments = Object.values(userExperiments).filter((experiment) => experiment.hash_key != undefined)
  const arrayGuildExperiments = Object.values(guildExperiments).filter((experiment) => experiment.hash_key != undefined)

  function pushUserExperiment(experiment: Experiment) {
    mappedExperiments.set((experiment.hash_key as string), {
      type: "user",
      hash_key: experiment.hash_key,
      hash: murmurhash(experiment.hash_key as string),
      title: experiment.title,
      name: experiment.name,
      description: experiment.description,
      buckets: experiment.buckets,
    })
  }

  function pushGuildExperiment(experiment: GuildExperiment) {
    mappedExperiments.set((experiment.hash_key as string), {
      type: "guild",
      hash_key: experiment.hash_key,
      hash: murmurhash(experiment.hash_key as string),
      title: experiment.hash_key as string,
      name: experiment.hash_key as string,
      description: [],
      buckets: [],
      revision: 0,
      rollout_position: 0,
      aa_mode: false
    })
  }

  // TODO: change the return type to an object, instead of Experiment[]
  for (let experiment of arrayUserExperiments) {
    pushUserExperiment(experiment)
  }

  for (let experiment of arrayGuildExperiments) {
    pushGuildExperiment(experiment)
  }


  const buildData: BuildData = {
    diffs: {
      experiments: [],
      strings: [],
    },
    experiments: mappedExperiments,
    date_found: new Date(Date.now()),
    built_on: new Date(clientInfo.built_at),
    branches: new Set([branch]),
    flags: [],
    build_number: clientInfo.build_number,
    build_hash: clientInfo.build_hash,
    latest: new Set([branch]),
    counts: {
      experiments: mappedExperiments.size,
      strings: strings.size,
    },
    schema_version: 2,
    scripts: {
      initial: initialScripts.map((script) => {
        return {
          path: script.path,
          flags: script.flags
        }
      }),
      lazy: lazyScripts.map((script) => {
        return {
          path: script.path,
          flags: script.flags
        }
      }),
    },
  }
  if (lastBuild !== undefined) {
    try {
      logger.log(`Computing difference between build ${buildData.build_hash} and ${lastBuild.build_hash}`)
      const diffs = await makeBuildDiff(branch, buildData, lastBuild)

      // TODO: don't throw away the experiments (i have to update the schema again..)
      buildData.diffs = {
        strings: diffs.strings,
        experiments: diffs.experiments
      }
      buildData.diff_against = lastBuild.build_hash
      logger.log(`Computed difference successfully! ${diffs.strings.length} strings changed, ${diffs.experiments.length} experiments changed`)
    } catch (err) {
      logger.error(`Failed to compute diffs~!`)
      buildData.flags.push(BuildFlags.NeedsRediff)
      console.error(err)
      throw err;
    }
  }

  logger.log(`Build ${buildData.build_number} has been compiled!\n
  Experiments: ${buildData.counts.experiments}
  Strings: ${buildData.counts.strings}\n
  \n
  Built at: ${new Date(clientInfo.built_at)}\n
  Build number: ${clientInfo.build_number}\n
  Build hash: ${clientInfo.build_hash}\n
  `)
  return buildData
}