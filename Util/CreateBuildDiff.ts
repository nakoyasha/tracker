import { LegacyBuildData } from "../Types/BuildData";
import { Diff, DiffType } from "../Types/Diff";
import { Experiment } from "../Types/Experiments";

type BuildStrings = { [key: string]: string }

export type LegacyDiffTable = {
  Added: Diff,
  Removed: String,
  Changed: String,
}

export type DiffTable = Diff[]
export type BuildDiff = {
  Strings: LegacyDiffTable,
  Experiments: LegacyDiffTable,
}

export function createBuildDiffByStrings(New: BuildStrings, Old: BuildStrings) {
  const addedStrings: DiffTable = []
  const changedStrings: DiffTable = []
  const removedStrings: DiffTable = []

  for (const [name, value] of Object.entries(Old)) {
    const originalValue = New[name]

    if (originalValue == undefined) {
      addedStrings.push({
        type: DiffType.Added,
        key: name,
        value: value
      })
    } else if (originalValue != value) {
      changedStrings.push({
        type: DiffType.Changed,
        key: name,
        value: value,
        newValue: value,
        oldValue: originalValue
      })
    }
  }

  for (const [name, value] of Object.entries(Old)) {
    const compareValue = New[name]

    if (compareValue == undefined) {
      removedStrings.push({
        type: DiffType.Removed,
        key: name,
        value: value
      })
    }
  }

  return {
    added: addedStrings,
    removed: removedStrings,
    changedStrings: changedStrings,
  }
}

// Outputs a BuildDiff with markdown diff strings - should only really be used for displaying diffs.
export function CreateBuildDiff(Original: LegacyBuildData, Compare: LegacyBuildData) {
  const addedStrings = []
  const changedStrings = []
  const removedStrings = []

  const addedExperiments = []
  const removedExperiments = []

  const originalStrings = JSON.parse(Original.Strings) as BuildStrings
  const compareStrings = JSON.parse(Compare.Strings) as BuildStrings

  const originalExperiments = Original.Experiments
  const compareExperiments = Compare.Experiments

  // strings pass
  for (const [name, value] of Object.entries(compareStrings)) {
    const originalValue = originalStrings[name]

    if (originalValue == undefined) {
      addedStrings.push(`+ ${name}: ${value}`)
    } else if (originalValue != value) {
      changedStrings.push(`- ${name}: ${originalValue}`)
      changedStrings.push(`+ ${name}: ${value}`)
    }
  }

  for (const [name, value] of Object.entries(originalStrings)) {
    const compareValue = compareStrings[name]

    if (compareValue == undefined) {
      removedStrings.push(`- ${name}: "${value}"`)
    }
  }

  // experiments pass
  for (const [name, value] of Object.entries(originalExperiments)) {
    // mongodb stuff; shouldnt be here at all !!
    if (name.startsWith("$")) {
      continue;
    }

    const experiment = (value as Experiment)
    const experimentName = experiment?.title || experiment.name
    const originalValue = originalExperiments.get(name) as Experiment

    if (originalValue == undefined) {
      addedExperiments.push(`+ ${name}: ${experimentName}`)
    }
  }

  for (const [name, value] of Object.entries(compareExperiments)) {
    if (name.startsWith("$")) {
      continue;
    }
    const experiment = (value as Experiment)
    const experimentName = experiment?.title || experiment.name
    const compareValue = originalExperiments.get(name)

    if (compareValue == undefined) {
      removedExperiments.push(`- ${name}: ${experimentName}`)
    }
  }

  return {
    Strings: {
      Added: addedStrings,
      Changed: changedStrings,
      Removed: removedStrings,
    },
    Experiments: {
      Added: addedExperiments,
      Removed: removedExperiments
    }
  }
}