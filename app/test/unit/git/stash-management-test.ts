import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { appendFile, writeFile } from 'fs/promises'
import { join } from 'node:path'
import { exec } from 'dugite'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'
import { getStatusOrThrow } from '../../helpers/status'
import {
  getAllStashEntries,
  getStashPatch,
  pushStashEntry,
  popStashEntryByName,
  dropStashEntryByName,
  clearAllStashEntries,
  createBranchFromStash,
} from '../../../src/lib/git/stash-management'

describe('git/stash-management', () => {
  const setup = async (t: TestContext): Promise<Repository> => {
    const repository = await setupEmptyRepository(t)
    const readme = join(repository.path, 'README.md')
    await writeFile(readme, '')
    await exec(['add', 'README.md'], repository.path)
    await exec(['commit', '-m', 'initial commit'], repository.path)
    return repository
  }

  it('returns false when there are no local changes to stash', async t => {
    const repository = await setup(t)
    const didCreate = await pushStashEntry(repository, {})

    assert.equal(didCreate, false)
    const entries = await getAllStashEntries(repository)
    assert.equal(entries.length, 0)
  })

  it('stashes only selected files when pathspec is an array', async t => {
    const repository = await setup(t)

    await writeFile(join(repository.path, 'a.txt'), 'a0')
    await writeFile(join(repository.path, 'b.txt'), 'b0')
    await exec(['add', 'a.txt', 'b.txt'], repository.path)
    await exec(['commit', '-m', 'add tracked files'], repository.path)

    await appendFile(join(repository.path, 'README.md'), 'readme change')
    await appendFile(join(repository.path, 'a.txt'), 'a change')
    await appendFile(join(repository.path, 'b.txt'), 'b change')

    const didCreate = await pushStashEntry(repository, {
      message: 'selected files stash',
      pathspec: ['README.md', 'a.txt'],
    })

    assert.equal(didCreate, true)

    const status = await getStatusOrThrow(repository)
    assert.equal(status.workingDirectory.files.length, 1)
    assert.equal(status.workingDirectory.files[0].path, 'b.txt')

    const entries = await getAllStashEntries(repository)
    assert.equal(entries.length, 1)
    assert.match(entries[0].message, /selected files stash/)
  })

  it('lists stash entries, previews patch output, and pops by name', async t => {
    const repository = await setup(t)
    const readme = join(repository.path, 'README.md')
    await appendFile(readme, 'hello stash')

    await pushStashEntry(repository, { message: 'preview stash' })

    const entries = await getAllStashEntries(repository)
    assert.equal(entries.length, 1)
    assert.match(entries[0].message, /preview stash/)

    const patch = await getStashPatch(repository, entries[0].name)
    assert.match(patch, /README\.md/)

    await popStashEntryByName(repository, entries[0].name)

    const status = await getStatusOrThrow(repository)
    assert.equal(status.workingDirectory.files.length, 1)

    const entriesAfterPop = await getAllStashEntries(repository)
    assert.equal(entriesAfterPop.length, 0)
  })

  it('drops a selected stash and clears the remaining entries', async t => {
    const repository = await setup(t)
    const readme = join(repository.path, 'README.md')

    await appendFile(readme, 'first change')
    await pushStashEntry(repository, { message: 'first stash' })

    await appendFile(readme, 'second change')
    await pushStashEntry(repository, { message: 'second stash' })

    const entries = await getAllStashEntries(repository)
    assert.equal(entries.length, 2)

    await dropStashEntryByName(repository, entries[1].name)

    const entriesAfterDrop = await getAllStashEntries(repository)
    assert.equal(entriesAfterDrop.length, 1)

    await clearAllStashEntries(repository)

    const entriesAfterClear = await getAllStashEntries(repository)
    assert.equal(entriesAfterClear.length, 0)
  })

  it('creates a branch from stash entry', async t => {
    const repository = await setup(t)
    const readme = join(repository.path, 'README.md')
    await appendFile(readme, 'branch from stash')
    await pushStashEntry(repository, { message: 'branch stash' })

    const entries = await getAllStashEntries(repository)
    assert.equal(entries.length, 1)

    await createBranchFromStash(repository, 'stash-work', entries[0].name)

    const branchResult = await exec(
      ['branch', '--list', 'stash-work'],
      repository.path
    )
    assert.equal(branchResult.exitCode, 0)
    assert.match(branchResult.stdout, /stash-work/)

    const entriesAfterBranch = await getAllStashEntries(repository)
    assert.equal(entriesAfterBranch.length, 0)
  })
})
