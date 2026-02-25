import { Repository } from '../../models/repository'
import {
  IStashManagementEntry,
  IStashPushOptions,
} from '../../models/stash-management-entry'
import { git } from './core'
import { createLogParser } from './git-delimiter-parser'
import { coerceToString } from './coerce-to-string'

const NoLocalChangesToSave = 'No local changes to save'
const NoChangesSelected = 'No changes selected'

function normalizePathspecs(
  pathspec: IStashPushOptions['pathspec']
): ReadonlyArray<string> {
  if (pathspec === undefined) {
    return []
  }

  if (typeof pathspec === 'string') {
    const trimmedPathspec = pathspec.trim()
    return trimmedPathspec.length > 0 ? [trimmedPathspec] : []
  }

  return pathspec.map(value => value.trim()).filter(value => value.length > 0)
}

/** Lists all stash entries (Desktop-created and CLI-created). */
export async function getAllStashEntries(
  repository: Repository
): Promise<ReadonlyArray<IStashManagementEntry>> {
  const { formatArgs, parse } = createLogParser({
    name: '%gd',
    stashSha: '%H',
    message: '%gs',
    createdRelative: '%cr',
  })

  const result = await git(
    ['stash', 'list', ...formatArgs],
    repository.path,
    'getAllStashEntries',
    { successExitCodes: new Set([0, 128]) }
  )

  if (result.exitCode === 128 || result.stdout.length === 0) {
    return []
  }

  const entries = parse(result.stdout)
  return entries.map(entry => ({
    name: coerceToString(entry.name),
    stashSha: coerceToString(entry.stashSha),
    message: coerceToString(entry.message),
    createdRelative: coerceToString(entry.createdRelative),
  }))
}

/** Returns `git stash show -p` output for a specific stash entry. */
export async function getStashPatch(
  repository: Repository,
  stashName: string
): Promise<string> {
  const { stdout } = await git(
    ['stash', 'show', '-p', '--no-color', stashName],
    repository.path,
    'getStashPatch'
  )

  return stdout
}

/** Creates a stash entry using options from the management UI. */
export async function pushStashEntry(
  repository: Repository,
  options: IStashPushOptions
): Promise<boolean> {
  const args = ['stash', 'push']

  if (options.includeAll) {
    args.push('-a')
  } else if (options.includeUntracked) {
    args.push('-u')
  }

  if (options.patch) {
    args.push('-p')
  }

  if (options.keepIndex) {
    args.push('--keep-index')
  }

  const message = options.message?.trim()
  if (message !== undefined && message.length > 0) {
    args.push('-m', message)
  }

  const pathspecs = normalizePathspecs(options.pathspec)
  if (pathspecs.length > 0) {
    args.push('--', ...pathspecs)
  }

  const result = await git(args, repository.path, 'pushStashEntry', {
    successExitCodes: new Set([0, 1]),
  })

  const output = `${coerceToString(result.stdout)}\n${coerceToString(
    result.stderr
  )}`
  const didCreate =
    output.includes(NoLocalChangesToSave) === false &&
    output.includes(NoChangesSelected) === false

  return didCreate
}

/** Applies a stash entry to the current working tree without dropping it. */
export async function applyStashEntry(
  repository: Repository,
  stashName: string,
  restoreIndex: boolean
): Promise<void> {
  const args = ['stash', 'apply']

  if (restoreIndex) {
    args.push('--index')
  }

  args.push(stashName)

  await git(args, repository.path, 'applyStashEntry')
}

/** Pops a stash entry and drops it on successful apply. */
export async function popStashEntryByName(
  repository: Repository,
  stashName: string
): Promise<void> {
  await git(['stash', 'pop', stashName], repository.path, 'popStashEntryByName')
}

/** Drops a specific stash entry. */
export async function dropStashEntryByName(
  repository: Repository,
  stashName: string
): Promise<void> {
  await git(
    ['stash', 'drop', stashName],
    repository.path,
    'dropStashEntryByName'
  )
}

/** Clears all stash entries. */
export async function clearAllStashEntries(
  repository: Repository
): Promise<void> {
  await git(['stash', 'clear'], repository.path, 'clearAllStashEntries')
}

/** Creates a new branch from a specific stash entry. */
export async function createBranchFromStash(
  repository: Repository,
  branchName: string,
  stashName: string
): Promise<void> {
  await git(
    ['stash', 'branch', branchName, stashName],
    repository.path,
    'createBranchFromStash'
  )
}
