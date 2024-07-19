import { ASTParser } from "../ASTParser";
import { ASTString, ASTStringsPlugin } from "../Strings";
import { ScriptFlags, fetchScriptFile } from "../../ClientScriptsPuller";
import Logger from "../../Logger";
import { BuildData } from "../../Types/BuildData";
import { Diff, DiffType } from "../../Types/Diff";
import { DiscordBranch } from "../../Types/DiscordBranch";

const logger = new Logger("Diff/CreateBuildDiff");

export type DiffTable = Diff[]
export type BuildDiff = {
  strings: DiffTable,
  experiments: DiffTable,
}

export async function getStrings(branch: DiscordBranch, build: BuildData) {
  const parser = new ASTParser([
    new ASTStringsPlugin()
  ])

  const languageObject = build.scripts.initial.find(script => script?.flags.includes(ScriptFlags.LanguageObject))

  if (languageObject != undefined) {
    // fetch the object
    languageObject.content = await fetchScriptFile(branch, `assets/${languageObject.path}`)

    await parser.parse([languageObject])
    return parser.getResult<ASTString>("strings")
  } else {
    throw new Error(`[FATAL] Could not find any script with the language_object flag! Build: ${build.build_number}`)
  }
}

export async function makeBuildDiff(branch: DiscordBranch, newBuild: BuildData, lastBuild: BuildData): Promise<BuildDiff> {
  const experiments: Diff[] = []
  const strings: Diff[] = []

  const newStrings = await getStrings(branch, newBuild)
  const lastStrings = await getStrings(branch, lastBuild)

  // added, changed
  for (const [stringName, stringValue] of newStrings) {
    const oldString = lastStrings.get(stringName)

    if (oldString == undefined) {
      strings.push({ type: DiffType.Added, key: stringName, value: stringValue })
    } else if (oldString !== stringValue) {
      strings.push({ type: DiffType.Changed, key: stringName, oldValue: oldString, newValue: stringValue })
    }
  }

  // removed
  for (const [stringName] of lastStrings) {
    if (!newStrings.has(stringName)) {
      strings.push({ type: DiffType.Removed, key: stringName })
    }
  }

  for (const [experimentName, experiment] of Object.entries(newBuild.experiments)) {
    const oldExperiment = lastBuild.experiments.get(experimentName)

    if (oldExperiment == undefined) {
      experiments.push({ type: DiffType.Added, key: experimentName, value: experiment })
    }
  }

  return {
    strings,
    experiments
  }
}