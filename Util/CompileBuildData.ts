import {
  ScriptFlags,
  pullClientScripts
} from "../ClientScriptsPuller"
import murmurhash from "murmurhash"
import { BuildData, BuildFlags } from "../Types/BuildData"
import Logger from "../Logger"
import { DiscordBranch } from "../Types/DiscordBranch"
import { Experiment, GuildExperiment } from "../Types/Experiments"
import { ASTParser } from "../AST/ASTParser"
import { ASTStringsPlugin } from "../AST/Strings"
import { ASTClientInfoPlugin, ClientInfo } from "../AST/ClientInfo"
import assert from "node:assert"
import { getExperiments } from ".."

const logger = new Logger("Util/CompileBuildData");

export async function compileBuildData(branch: DiscordBranch = DiscordBranch.Stable, overrideUrl?: string): Promise<BuildData> {
  logger.log("Fetching initial scripts...")
  const scripts = await pullClientScripts("full", branch, overrideUrl)

  if (scripts === undefined) {
    logger.error("Failed to fetch initial scripts");
    throw new Error("Failed to fetch initial scripts")
  }

  let initialScripts = scripts.initial
  let lazyScripts = scripts.lazy

  logger.log("Fetching experiments..")

  // ts silliness
  let experiments = await getExperiments(branch, [...initialScripts, ...lazyScripts])
  const userExperiments = experiments.user
  const guildExperiments = experiments.guild

  const parser = new ASTParser([
    new ASTStringsPlugin(),
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
  await parser.parse(initialScripts)
  const clientInfo = parser.getResult<ClientInfo>("client-info")
  const strings = parser.getResult<Map<string, string>>("strings")

  assert(clientInfo.build_number != undefined, "Compile error: Couldn't find buildNumber!")
  assert(clientInfo.build_hash != undefined, "Compile error: Couldn't find buildHash!")
  assert(clientInfo.built_at != undefined, "Compile error: Couldn't find builtAt!")

  logger.log(`Build info: 
    Built at: ${new Date(clientInfo.built_at)}
    Build number: ${clientInfo.build_number}
    Build hash: ${clientInfo.build_hash}
  `)

  logger.log(`Compiling experiments..`)
  const mappedExperiments = new Map<string, Experiment>() as Map<string, Experiment>

  // TODO: put this in getClientExperiments instead of here
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

  // const diff = await makeBuildDiff(initialScripts, (await lastBuild).scripts)

  const buildData: BuildData = {
    strings_diff: [],
    experiments: mappedExperiments,
    date_found: new Date(Date.now()),
    built_on: new Date(clientInfo.built_at),
    branches: [branch],
    flags: [BuildFlags.NeedsStringRediff],
    build_number: clientInfo.build_number,
    build_hash: clientInfo.build_hash,
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

  logger.log(`Build ${buildData.build_number} has been compiled!\n
  Experiments: ${buildData.counts.experiments}
  Strings: ${buildData.counts.strings}
  `)
  return buildData
}