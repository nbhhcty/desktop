import * as React from 'react'
import classNames from 'classnames'
import { Repository } from '../../models/repository'
import { Dispatcher, defaultErrorHandler } from '../dispatcher'
import { IStashManagementEntry } from '../../models/stash-management-entry'
import { Button } from '../lib/button'
import { IMenuItem, showContextualMenu } from '../../lib/menu-item'
import { Dialog, DialogContent, DialogFooter, DialogStackContext } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'

interface IStashManagementSidebarProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly selectedStashName: string | null
  readonly refreshToken: number
  readonly onSelectionChanged: (stashName: string | null) => void
}

interface IStashManagementSidebarState {
  readonly entries: ReadonlyArray<IStashManagementEntry>
  readonly isLoadingEntries: boolean
  readonly isRunningCommand: boolean
  readonly statusMessage: string | null
  readonly isCreateBranchDialogOpen: boolean
  readonly createBranchName: string
  readonly createBranchStashName: string | null
}

export class StashManagementSidebar extends React.Component<
  IStashManagementSidebarProps,
  IStashManagementSidebarState
> {
  public constructor(props: IStashManagementSidebarProps) {
    super(props)

    this.state = {
      entries: [],
      isLoadingEntries: false,
      isRunningCommand: false,
      statusMessage: null,
      isCreateBranchDialogOpen: false,
      createBranchName: '',
      createBranchStashName: null,
    }
  }

  public componentDidMount() {
    this.loadEntries(this.props.selectedStashName)
  }

  public componentDidUpdate(prevProps: IStashManagementSidebarProps) {
    if (prevProps.repository.id !== this.props.repository.id) {
      this.setState(
        {
          entries: [],
          statusMessage: null,
          isCreateBranchDialogOpen: false,
          createBranchName: '',
          createBranchStashName: null,
        },
        () => this.loadEntries(null)
      )
      return
    }

    if (prevProps.refreshToken !== this.props.refreshToken) {
      this.loadEntries(this.props.selectedStashName)
    }
  }

  public render() {
    const { entries, isLoadingEntries, isRunningCommand, statusMessage } =
      this.state

    return (
      <div id="stash-management-sidebar" className="panel">
        <div className="stash-management-sidebar-toolbar">
          <h3>Read</h3>
          <Button onClick={this.onRefresh} disabled={isRunningCommand}>
            Refresh
          </Button>
        </div>

        <div className="stash-management-command-list">
          <code>git stash list</code>
          <code>git stash show -p stash@{'{n}'}</code>
        </div>

        <div className="stash-management-list">
          {isLoadingEntries ? (
            <div className="stash-management-placeholder">
              Loading stash entries...
            </div>
          ) : entries.length === 0 ? (
            <div className="stash-management-placeholder">
              No stash entries found.
            </div>
          ) : (
            entries.map(entry => (
              <button
                key={entry.name}
                type="button"
                className={classNames('stash-management-row', {
                  selected: entry.name === this.props.selectedStashName,
                })}
                onClick={this.onEntryButtonClicked}
                onContextMenu={this.onEntryButtonContextMenu}
                data-stash-name={entry.name}
                disabled={isRunningCommand}
              >
                <div className="stash-management-row-title">{entry.name}</div>
                <div className="stash-management-row-message">
                  {entry.message}
                </div>
                <div className="stash-management-row-meta">
                  {entry.createdRelative}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="stash-management-sidebar-hint">
          Right-click an entry for Apply, Pop, Drop, Branch, and Clear.
        </div>

        {statusMessage !== null ? (
          <div className="stash-management-status">{statusMessage}</div>
        ) : null}

        {this.renderCreateBranchDialog()}
      </div>
    )
  }

  private onRefresh = () => {
    this.loadEntries(this.props.selectedStashName)
  }

  private onEntryButtonClicked = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const stashName = event.currentTarget.dataset.stashName
    if (stashName === undefined) {
      return
    }

    this.props.onSelectionChanged(stashName)
  }

  private onEntryButtonContextMenu = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()

    if (this.state.isRunningCommand) {
      return
    }

    const stashName = event.currentTarget.dataset.stashName
    if (stashName === undefined) {
      return
    }

    if (stashName !== this.props.selectedStashName) {
      this.props.onSelectionChanged(stashName)
    }

    showContextualMenu(this.getContextMenuItems(stashName))
  }

  private getContextMenuItems(stashName: string): ReadonlyArray<IMenuItem> {
    return [
      {
        label: 'Apply',
        action: () => this.apply(stashName, false),
      },
      {
        label: 'Apply --index',
        action: () => this.apply(stashName, true),
      },
      {
        label: 'Pop',
        action: () => this.pop(stashName),
      },
      { type: 'separator' },
      {
        label: 'Branch From Stash…',
        action: () => this.openCreateBranchDialog(stashName),
      },
      { type: 'separator' },
      {
        label: 'Drop',
        action: () => this.drop(stashName),
      },
      {
        label: 'Clear All',
        action: () => this.clearAll(),
      },
      { type: 'separator' },
      {
        label: 'Refresh',
        action: this.onRefresh,
      },
    ]
  }

  private apply = (stashName: string, restoreIndex: boolean) =>
    this.runMutation(
      () =>
        this.props.dispatcher.applyStashEntry(
          this.props.repository,
          stashName,
          restoreIndex
        ),
      restoreIndex ? 'Applied stash with index.' : 'Applied stash.',
      stashName
    )

  private pop = (stashName: string) =>
    this.runMutation(
      () =>
        this.props.dispatcher.popStashEntryByName(this.props.repository, stashName),
      'Popped stash.',
      null
    )

  private drop = (stashName: string) =>
    this.runMutation(
      () =>
        this.props.dispatcher.dropStashEntryByName(
          this.props.repository,
          stashName
        ),
      'Dropped stash entry.',
      null
    )

  private clearAll = () =>
    this.runMutation(
      () => this.props.dispatcher.clearAllStashEntries(this.props.repository),
      'Cleared all stash entries.',
      null
    )

  private openCreateBranchDialog = (stashName: string) => {
    this.setState({
      isCreateBranchDialogOpen: true,
      createBranchName: '',
      createBranchStashName: stashName,
      statusMessage: null,
    })
  }

  private onCreateBranchNameChanged = (createBranchName: string) => {
    this.setState({ createBranchName })
  }

  private onCreateBranchDialogDismissed = () => {
    if (this.state.isRunningCommand) {
      return
    }

    this.setState({
      isCreateBranchDialogOpen: false,
      createBranchName: '',
      createBranchStashName: null,
    })
  }

  private onCreateBranchDialogSubmit = async () => {
    const stashName = this.state.createBranchStashName
    const branchName = this.state.createBranchName.trim()

    if (stashName === null || branchName.length === 0) {
      return
    }

    await this.runMutation(
      () =>
        this.props.dispatcher.createBranchFromStash(
          this.props.repository,
          branchName,
          stashName
        ),
      `Created branch "${branchName}" from stash.`,
      null
    )

    this.setState({
      isCreateBranchDialogOpen: false,
      createBranchName: '',
      createBranchStashName: null,
    })
  }

  private renderCreateBranchDialog() {
    if (!this.state.isCreateBranchDialogOpen) {
      return null
    }

    return (
      <DialogStackContext.Provider value={{ isTopMost: true }}>
        <Dialog
          id="stash-management-branch-dialog"
          title={__DARWIN__ ? 'Branch From Stash' : 'Branch from stash'}
          onSubmit={this.onCreateBranchDialogSubmit}
          onDismissed={this.onCreateBranchDialogDismissed}
          disabled={this.state.isRunningCommand}
          loading={this.state.isRunningCommand}
        >
          <DialogContent>
            <div>
              <TextBox
                ariaLabel="Branch name for stash branch"
                placeholder="new-branch-name"
                value={this.state.createBranchName}
                onValueChanged={this.onCreateBranchNameChanged}
              />
            </div>
          </DialogContent>
          <DialogFooter>
            <OkCancelButtonGroup
              okButtonText={__DARWIN__ ? 'Create Branch' : 'Create branch'}
              okButtonDisabled={this.state.createBranchName.trim().length === 0}
            />
          </DialogFooter>
        </Dialog>
      </DialogStackContext.Provider>
    )
  }

  private async runMutation(
    action: () => Promise<boolean>,
    statusMessage: string,
    preferredSelection: string | null
  ) {
    this.setState({
      isRunningCommand: true,
      statusMessage: null,
    })

    try {
      const didSucceed = await action()
      if (!didSucceed) {
        this.setState({ statusMessage: 'Stash command failed.' })
        return
      }

      this.setState({ statusMessage })
      await this.loadEntries(preferredSelection)
    } catch (error) {
      await defaultErrorHandler(this.coerceToError(error), this.props.dispatcher)
    } finally {
      this.setState({ isRunningCommand: false })
    }
  }

  private async loadEntries(preferredSelection: string | null) {
    this.setState({ isLoadingEntries: true })

    try {
      const entries = await this.props.dispatcher.getStashManagementEntries(
        this.props.repository
      )

      const selectedStashName =
        preferredSelection !== null &&
        entries.some(entry => entry.name === preferredSelection)
          ? preferredSelection
          : this.props.selectedStashName !== null &&
              entries.some(entry => entry.name === this.props.selectedStashName)
            ? this.props.selectedStashName
            : entries[0]?.name ?? null

      this.setState({
        entries,
        isLoadingEntries: false,
      })

      if (selectedStashName !== this.props.selectedStashName) {
        this.props.onSelectionChanged(selectedStashName)
      }
    } catch (error) {
      this.setState({ isLoadingEntries: false })
      await defaultErrorHandler(this.coerceToError(error), this.props.dispatcher)
    }
  }

  private coerceToError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error))
  }
}

