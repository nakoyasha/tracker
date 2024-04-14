export enum DiffType {
    Added = "added",
    Removed = "removed",
    Changed = "changed",
}

export type Diff = {
    type: DiffType,
    key: string,
    value?: string,
    newValue?: string,
    oldValue?: string,
}
