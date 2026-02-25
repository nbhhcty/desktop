export interface IStashManagementEntry {
  /** The entry identifier in the format `stash@{n}`. */
  readonly name: string

  /** SHA for the stash commit object. */
  readonly stashSha: string

  /** Subject/message associated with the stash entry. */
  readonly message: string

  /** Relative creation date, e.g. "2 hours ago". */
  readonly createdRelative: string
}

export interface IStashPushOptions {
  /** Optional message for `git stash push -m`. */
  readonly message?: string

  /** Include untracked files (`-u`). */
  readonly includeUntracked?: boolean

  /** Include ignored and untracked files (`-a`). */
  readonly includeAll?: boolean

  /** Interactively select hunks (`-p`). */
  readonly patch?: boolean

  /** Keep index untouched (`--keep-index`). */
  readonly keepIndex?: boolean

  /** Optional pathspec(s) for `git stash push -- <pathspec> ...`. */
  readonly pathspec?: string | ReadonlyArray<string>
}
