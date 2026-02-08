import * as React from 'react'
import classNames from 'classnames'
import { Branch } from '../../models/branch'
import { Commit } from '../../models/commit'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { getAvatarUsersForCommit } from '../../models/avatar'
import { getCommits } from '../../lib/git/log'
import { Dispatcher, defaultErrorHandler } from '../dispatcher'
import { FancyTextBox } from '../lib/fancy-text-box'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Popover, PopoverAnchorPosition, PopoverDecoration } from '../lib/popover'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RelativeTime } from '../relative-time'
import { AvatarStack } from '../lib/avatar-stack'
import { CommitAttribution } from '../lib/commit-attribution'
import { enableAccessibleListToolTips } from '../../lib/feature-flag'
import { getStringArray, setStringArray } from '../../lib/local-storage'

const MaxCommitsToDisplay = 500
const MaxRecentPaths = 5
const AllBranchesValue = '__all_branches__'
const AllUsersValue = '__all_users__'
const HistoryManagementRecentPathsKeyPrefix = 'history-management-recent-paths'

type DateFilter = 'all' | '24h' | '7d'
type OpenDropdown = 'branch' | 'user' | 'date' | 'paths' | null

interface IHistoryManagementViewProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly accounts: ReadonlyArray<Account>
  readonly branches: ReadonlyArray<Branch>
  readonly defaultBranchName: string
  readonly onViewCommitOnGitHub: (sha: string) => void
}

interface IHistoryManagementViewState {
  readonly filterText: string
  readonly selectedBranch: string
  readonly selectedUser: string
  readonly selectedDateFilter: DateFilter
  readonly selectedPath: string
  readonly pathInput: string
  readonly recentPaths: ReadonlyArray<string>
  readonly sortAscending: boolean
  readonly openDropdown: OpenDropdown
  readonly branchFilterText: string
  readonly userFilterText: string
  readonly commits: ReadonlyArray<Commit>
  readonly selectedSha: string | null
  readonly isLoading: boolean
}

interface IOption<TValue extends string = string> {
  readonly label: string
  readonly value: TValue
}

export class HistoryManagementView extends React.Component<
  IHistoryManagementViewProps,
  IHistoryManagementViewState
> {
  private branchButtonRef: HTMLButtonElement | null = null
  private userButtonRef: HTMLButtonElement | null = null
  private dateButtonRef: HTMLButtonElement | null = null
  private pathsButtonRef: HTMLButtonElement | null = null
  private loadRequestId = 0

  public constructor(props: IHistoryManagementViewProps) {
    super(props)

    const recentPaths = loadRecentPathsFromStorage(props.repository)

    this.state = {
      filterText: '',
      selectedBranch: this.getDefaultBranchValue(props),
      selectedUser: AllUsersValue,
      selectedDateFilter: 'all',
      selectedPath: '',
      pathInput: '',
      recentPaths,
      sortAscending: false,
      openDropdown: null,
      branchFilterText: '',
      userFilterText: '',
      commits: [],
      selectedSha: null,
      isLoading: false,
    }
  }

  public componentDidMount() {
    this.loadCommits()
  }

  public componentDidUpdate(prevProps: IHistoryManagementViewProps) {
    const previousDefaultBranch = this.getDefaultBranchValue(prevProps)
    const nextDefaultBranch = this.getDefaultBranchValue(this.props)

    if (
      this.state.selectedBranch === previousDefaultBranch &&
      nextDefaultBranch !== previousDefaultBranch
    ) {
      this.setState({ selectedBranch: nextDefaultBranch }, this.loadCommits)
    }
  }

  public applyPathFilterFromExternal(path: string) {
    const normalizedPath = path.trim()
    if (normalizedPath.length === 0) {
      return
    }

    this.onRecentPathSelected(normalizedPath)
  }

  public render() {
    const visibleCommits = this.getVisibleCommits()
    const selectedBranchLabel = this.getSelectedBranchLabel(
      this.props.defaultBranchName
    )
    const selectedUserLabel =
      this.state.selectedUser === AllUsersValue ? 'User' : this.state.selectedUser
    const selectedDateLabel = getDateFilterLabel(this.state.selectedDateFilter)
    const selectedPathLabel =
      this.state.selectedPath.length > 0 ? this.state.selectedPath : 'Paths'

    return (
      <div id="history-management-view" role="tabpanel" aria-labelledby="history-management-tab">
        <div className="history-management-toolbar">
          <div className="history-management-filters">
            {this.renderFilterButton(
              selectedBranchLabel,
              this.onBranchFilterButtonClicked,
              this.onBranchButtonRef,
              this.state.openDropdown === 'branch'
            )}
            {this.renderFilterButton(
              selectedUserLabel,
              this.onUserFilterButtonClicked,
              this.onUserButtonRef,
              this.state.openDropdown === 'user'
            )}
            {this.renderFilterButton(
              selectedDateLabel,
              this.onDateFilterButtonClicked,
              this.onDateButtonRef,
              this.state.openDropdown === 'date'
            )}
            {this.renderFilterButton(
              selectedPathLabel,
              this.onPathsFilterButtonClicked,
              this.onPathsButtonRef,
              this.state.openDropdown === 'paths'
            )}

            <Button
              className="history-management-icon-button"
              onClick={this.toggleSortOrder}
              ariaLabel="Toggle date sorting order"
            >
              <Octicon
                symbol={
                  this.state.sortAscending ? octicons.sortAsc : octicons.sortDesc
                }
              />
            </Button>

            <Button
              className="history-management-icon-button"
              onClick={this.loadCommits}
              ariaLabel="Refresh history"
            >
              <Octicon symbol={octicons.sync} />
            </Button>
          </div>

          <FancyTextBox
            ariaLabel="Text or hash"
            className="history-management-search"
            symbol={octicons.search}
            displayClearButton={true}
            placeholder="Text or hash"
            value={this.state.filterText}
            onRef={this.onSearchTextBoxRef}
            onValueChanged={this.onFilterTextChanged}
            onSearchCleared={this.onSearchCleared}
          />
        </div>

        <div className="history-management-results">
          {this.state.isLoading
            ? 'Loading...'
            : `${visibleCommits.length} commits shown`}
        </div>

        <div className="history-management-table">
          <div className="history-management-table-body">
            {this.state.isLoading
              ? this.renderPlaceholder('Loading history...')
              : visibleCommits.length === 0
              ? this.renderPlaceholder('No commits matched the current filters')
              : visibleCommits.map(this.renderCommitRow)}
          </div>
        </div>

        {this.renderOpenDropdown()}
      </div>
    )
  }

  private onSearchTextBoxRef = (_textbox: TextBox) => {}

  private getDefaultBranchValue(props: IHistoryManagementViewProps): string {
    return props.defaultBranchName
  }

  private getSelectedBranchLabel(defaultBranchName: string): string {
    const branchOptions = this.getBranchOptions()
    const selected = branchOptions.find(
      option => option.value === this.state.selectedBranch
    )
    return selected?.label ?? defaultBranchName
  }

  private renderFilterButton(
    label: string,
    onClick: () => void,
    onButtonRef: (buttonRef: HTMLButtonElement | null) => void,
    isOpen: boolean
  ) {
    return (
      <Button
        className={classNames('history-management-filter-button', { open: isOpen })}
        onClick={onClick}
        onButtonRef={onButtonRef}
        ariaExpanded={isOpen}
      >
        <span className="history-management-filter-button-label">{label}</span>
        <Octicon symbol={octicons.triangleDown} />
      </Button>
    )
  }

  private renderCommitRow = (commit: Commit) => {
    const selected = this.state.selectedSha === commit.sha
    const hasEmptySummary = commit.summary.trim().length === 0
    const summary = hasEmptySummary ? 'Empty commit message' : commit.summary
    const tag = commit.tags.length > 0 ? commit.tags[0] : undefined
    const avatarUsers = getAvatarUsersForCommit(
      this.props.repository.gitHubRepository,
      commit
    )

    return (
      <button
        key={commit.sha}
        className={classNames('history-management-row', { selected })}
        data-sha={commit.sha}
        onClick={this.onCommitRowClicked}
        onDoubleClick={this.onCommitRowDoubleClicked}
      >
        <div className="history-management-commit">
          <div className="history-management-info">
            <span
              className={classNames('history-management-summary', {
                'empty-summary': hasEmptySummary,
              })}
            >
              {summary}
            </span>
            <div className="history-management-description">
              <div className="history-management-byline">
                <AvatarStack
                  users={avatarUsers}
                  accounts={this.props.accounts}
                  tooltip={!enableAccessibleListToolTips()}
                />
                <CommitAttribution avatarUsers={avatarUsers} />
                {' • '}
                <RelativeTime date={commit.author.date} tooltip={false} />
              </div>
            </div>
          </div>
          {tag !== undefined ? (
            <div className="history-management-indicators">
              <span className="history-management-tag">{tag}</span>
            </div>
          ) : null}
        </div>
      </button>
    )
  }

  private renderPlaceholder(message: string) {
    return <div className="history-management-placeholder">{message}</div>
  }

  private renderOpenDropdown() {
    switch (this.state.openDropdown) {
      case 'branch':
        return this.renderDropdownPopover(
          this.branchButtonRef,
          this.renderBranchDropdown()
        )
      case 'user':
        return this.renderDropdownPopover(this.userButtonRef, this.renderUserDropdown())
      case 'date':
        return this.renderDropdownPopover(this.dateButtonRef, this.renderDateDropdown())
      case 'paths':
        return this.renderDropdownPopover(
          this.pathsButtonRef,
          this.renderPathsDropdown()
        )
      case null:
        return null
      default:
        return null
    }
  }

  private renderDropdownPopover(anchor: HTMLElement | null, children: JSX.Element) {
    if (anchor === null) {
      return null
    }

    return (
      <Popover
        className="history-management-filter-popover"
        anchor={anchor}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        decoration={PopoverDecoration.Balloon}
        onClickOutside={this.closeDropdown}
        trapFocus={false}
        isDialog={false}
        maxHeight={360}
      >
        {children}
      </Popover>
    )
  }

  private renderBranchDropdown() {
    const filterText = this.state.branchFilterText.trim().toLowerCase()
    const branchOptions = this.getBranchOptions().filter(option =>
      option.label.toLowerCase().includes(filterText)
    )

    return (
      <div className="history-management-dropdown">
        <div className="history-management-dropdown-search">
          <TextBox
            ariaLabel="Filter branches"
            type="search"
            placeholder="Select..."
            value={this.state.branchFilterText}
            onValueChanged={this.onBranchFilterTextChanged}
            displayClearButton={true}
            onSearchCleared={this.onBranchFilterCleared}
          />
        </div>
        <div className="history-management-dropdown-list">
          {branchOptions.length === 0 ? (
            <div className="history-management-dropdown-empty">No branches</div>
          ) : (
            branchOptions.map(option =>
              this.renderDropdownItem(
                option.label,
                option.value === this.state.selectedBranch,
                () => this.onBranchSelected(option.value),
                option.value
              )
            )
          )}
        </div>
      </div>
    )
  }

  private renderUserDropdown() {
    const filterText = this.state.userFilterText.trim().toLowerCase()
    const options = this.getUserOptions().filter(option =>
      option.label.toLowerCase().includes(filterText)
    )

    return (
      <div className="history-management-dropdown">
        <div className="history-management-dropdown-search">
          <TextBox
            ariaLabel="Filter users"
            type="search"
            placeholder="Select..."
            value={this.state.userFilterText}
            onValueChanged={this.onUserFilterTextChanged}
            displayClearButton={true}
            onSearchCleared={this.onUserFilterCleared}
          />
        </div>
        <div className="history-management-dropdown-list">
          {options.length === 0 ? (
            <div className="history-management-dropdown-empty">No users</div>
          ) : (
            options.map(option =>
              this.renderDropdownItem(
                option.label,
                option.value === this.state.selectedUser,
                () => this.onUserSelected(option.value),
                option.value
              )
            )
          )}
        </div>
      </div>
    )
  }

  private renderDateDropdown() {
    const options: ReadonlyArray<IOption<DateFilter>> = [
      { label: 'All time', value: 'all' },
      { label: 'Last 24 hours', value: '24h' },
      { label: 'Last 7 days', value: '7d' },
    ]

    return (
      <div className="history-management-dropdown">
        <div className="history-management-dropdown-list">
          {options.map(option =>
            this.renderDropdownItem(
              option.label,
              option.value === this.state.selectedDateFilter,
              () => this.onDateFilterSelected(option.value),
              option.value
            )
          )}
        </div>
      </div>
    )
  }

  private renderPathsDropdown() {
    return (
      <div className="history-management-dropdown">
        <div className="history-management-dropdown-search">
          <TextBox
            ariaLabel="Filter file or folder"
            type="search"
            placeholder="Filter file or folder"
            value={this.state.pathInput}
            onValueChanged={this.onPathInputChanged}
            displayClearButton={true}
            onSearchCleared={this.onPathInputCleared}
          />
        </div>

        <div className="history-management-dropdown-actions">
          <Button onClick={this.applyPathFilter}>Apply</Button>
          <Button onClick={this.clearPathFilter}>Clear</Button>
        </div>

        {this.state.recentPaths.length > 0 ? (
          <>
            <div className="history-management-dropdown-divider" />
            <div className="history-management-dropdown-section-label">Recent</div>
            <div className="history-management-dropdown-list">
              {this.state.recentPaths.map(path => this.renderRecentPathItem(path))}
            </div>
          </>
        ) : null}
      </div>
    )
  }

  private renderDropdownItem(
    label: string,
    selected: boolean,
    onClick: () => void,
    key: string
  ) {
    return (
      <button
        key={key}
        className={classNames('history-management-dropdown-item', { selected })}
        onClick={onClick}
      >
        <span className="history-management-dropdown-item-check">
          {selected ? <Octicon symbol={octicons.check} /> : null}
        </span>
        <span className="history-management-dropdown-item-text">{label}</span>
      </button>
    )
  }

  private renderRecentPathItem(path: string) {
    const selected = path === this.state.selectedPath
    return (
      <div
        key={path}
        className={classNames('history-management-dropdown-item-row', { selected })}
      >
        {this.renderDropdownItem(
          path,
          selected,
          () => this.onRecentPathSelected(path),
          `${path}-select`
        )}
        <button
          className="history-management-dropdown-item-delete"
          onMouseDown={this.onRecentPathRemoveButtonMouseDown}
          onClick={this.onRecentPathRemoveButtonClicked}
          data-path={path}
          aria-label={`Remove ${path} from recent paths`}
        >
          <Octicon symbol={octicons.x} />
        </button>
      </div>
    )
  }

  private getBranchOptions(): ReadonlyArray<IOption> {
    const options = new Array<IOption>()
    const seen = new Set<string>()
    const defaultBranch = this.getDefaultBranchValue(this.props)

    options.push({ label: 'All branches', value: AllBranchesValue })
    seen.add(AllBranchesValue)

    options.push({ label: `HEAD (${defaultBranch})`, value: defaultBranch })
    seen.add(defaultBranch)

    const sortedBranches = [...this.props.branches].sort((a, b) =>
      a.name.localeCompare(b.name)
    )

    for (const branch of sortedBranches) {
      if (seen.has(branch.name)) {
        continue
      }

      options.push({ label: branch.name, value: branch.name })
      seen.add(branch.name)
    }

    return options
  }

  private getUserOptions(): ReadonlyArray<IOption> {
    const options = new Array<IOption>()
    const users = new Set<string>()

    options.push({ label: 'All users', value: AllUsersValue })

    for (const commit of this.state.commits) {
      users.add(getCommitAuthorLabel(commit))
    }

    const sortedUsers = [...users].sort((a, b) => a.localeCompare(b))

    for (const user of sortedUsers) {
      options.push({ label: user, value: user })
    }

    return options
  }

  private getVisibleCommits(): ReadonlyArray<Commit> {
    const filterText = this.state.filterText.trim().toLowerCase()
    const user = this.state.selectedUser
    const threshold = getDateThreshold(this.state.selectedDateFilter)

    const commits = this.state.commits.filter(commit => {
      if (user !== AllUsersValue && getCommitAuthorLabel(commit) !== user) {
        return false
      }

      if (threshold !== null && commit.author.date.getTime() < threshold) {
        return false
      }

      if (filterText.length === 0) {
        return true
      }

      const haystack = [
        commit.sha,
        commit.shortSha,
        commit.summary,
        commit.body,
        commit.author.name,
        commit.author.email,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(filterText)
    })

    commits.sort((a, b) =>
      this.state.sortAscending
        ? a.author.date.getTime() - b.author.date.getTime()
        : b.author.date.getTime() - a.author.date.getTime()
    )

    return commits
  }

  private loadCommits = async () => {
    const requestId = ++this.loadRequestId
    const selectedBranch = this.state.selectedBranch
    const selectedPath = this.state.selectedPath.trim()
    const revisionRange =
      selectedBranch === AllBranchesValue ? '--all' : selectedBranch
    const pathspecs = selectedPath.length > 0 ? [selectedPath] : []

    this.setState({ isLoading: true })

    try {
      const commits = await getCommits(
        this.props.repository,
        revisionRange,
        MaxCommitsToDisplay,
        0,
        [],
        pathspecs
      )

      if (requestId !== this.loadRequestId) {
        return
      }

      this.props.dispatcher.cacheCommitsForLookup(
        this.props.repository,
        commits
      )

      this.setState(previousState => {
        const selectedSha =
          previousState.selectedSha !== null &&
          commits.some(commit => commit.sha === previousState.selectedSha)
            ? previousState.selectedSha
            : commits[0]?.sha ?? null

        const selectedUser =
          previousState.selectedUser === AllUsersValue ||
          commits.some(
            commit => getCommitAuthorLabel(commit) === previousState.selectedUser
          )
            ? previousState.selectedUser
            : AllUsersValue

        return {
          commits,
          selectedSha,
          selectedUser,
          isLoading: false,
        }
      })
    } catch (error) {
      if (requestId !== this.loadRequestId) {
        return
      }

      this.setState({ isLoading: false })
      const parsedError =
        error instanceof Error ? error : new Error(String(error))
      defaultErrorHandler(parsedError, this.props.dispatcher)
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onSearchCleared = () => {
    this.setState({ filterText: '' })
  }

  private onBranchButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.branchButtonRef = buttonRef
  }

  private onUserButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.userButtonRef = buttonRef
  }

  private onDateButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.dateButtonRef = buttonRef
  }

  private onPathsButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.pathsButtonRef = buttonRef
  }

  private toggleDropdown = (dropdown: Exclude<OpenDropdown, null>) => {
    this.setState(previousState => ({
      openDropdown: previousState.openDropdown === dropdown ? null : dropdown,
    }))
  }

  private onBranchFilterButtonClicked = () => {
    this.toggleDropdown('branch')
  }

  private onUserFilterButtonClicked = () => {
    this.toggleDropdown('user')
  }

  private onDateFilterButtonClicked = () => {
    this.toggleDropdown('date')
  }

  private onPathsFilterButtonClicked = () => {
    this.toggleDropdown('paths')
  }

  private closeDropdown = () => {
    this.setState({ openDropdown: null })
  }

  private onBranchFilterTextChanged = (branchFilterText: string) => {
    this.setState({ branchFilterText })
  }

  private onBranchFilterCleared = () => {
    this.setState({ branchFilterText: '' })
  }

  private onUserFilterTextChanged = (userFilterText: string) => {
    this.setState({ userFilterText })
  }

  private onUserFilterCleared = () => {
    this.setState({ userFilterText: '' })
  }

  private onBranchSelected = (selectedBranch: string) => {
    if (selectedBranch === this.state.selectedBranch) {
      this.setState({ openDropdown: null, branchFilterText: '' })
      return
    }

    this.setState(
      {
        selectedBranch,
        openDropdown: null,
        branchFilterText: '',
      },
      this.loadCommits
    )
  }

  private onUserSelected = (selectedUser: string) => {
    this.setState({
      selectedUser,
      openDropdown: null,
      userFilterText: '',
    })
  }

  private onDateFilterSelected = (selectedDateFilter: DateFilter) => {
    this.setState({
      selectedDateFilter,
      openDropdown: null,
    })
  }

  private onPathInputChanged = (pathInput: string) => {
    this.setState({ pathInput })
  }

  private onPathInputCleared = () => {
    this.setState({ pathInput: '' })
  }

  private applyPathFilter = () => {
    const selectedPath = this.state.pathInput.trim()
    const didChange = selectedPath !== this.state.selectedPath
    const nextRecentPaths =
      selectedPath.length === 0
        ? this.state.recentPaths
        : this.getUpdatedRecentPaths(this.state.recentPaths, selectedPath)
    const didRecentPathsChange = nextRecentPaths !== this.state.recentPaths

    this.setState(
      {
        recentPaths: nextRecentPaths,
        selectedPath,
        openDropdown: null,
      },
      () => {
        if (didRecentPathsChange) {
          saveRecentPathsToStorage(this.props.repository, this.state.recentPaths)
        }

        if (didChange) {
          this.loadCommits()
        }
      }
    )
  }

  private clearPathFilter = () => {
    if (this.state.selectedPath.length === 0 && this.state.pathInput.length === 0) {
      this.setState({ openDropdown: null })
      return
    }

    this.setState(
      {
        selectedPath: '',
        pathInput: '',
        openDropdown: null,
      },
      this.loadCommits
    )
  }

  private onRecentPathSelected = (path: string) => {
    const nextRecentPaths = this.getUpdatedRecentPaths(this.state.recentPaths, path)
    const didRecentPathsChange = nextRecentPaths !== this.state.recentPaths

    if (path === this.state.selectedPath) {
      this.setState({
        pathInput: path,
        recentPaths: nextRecentPaths,
        openDropdown: null,
      })
      if (didRecentPathsChange) {
        saveRecentPathsToStorage(this.props.repository, nextRecentPaths)
      }
      return
    }

    this.setState(
      {
        selectedPath: path,
        pathInput: path,
        recentPaths: nextRecentPaths,
        openDropdown: null,
      },
      () => {
        if (didRecentPathsChange) {
          saveRecentPathsToStorage(this.props.repository, this.state.recentPaths)
        }
        this.loadCommits()
      }
    )
  }

  private onRecentPathRemoved = (path: string) => {
    const nextRecentPaths = this.state.recentPaths.filter(p => p !== path)
    if (nextRecentPaths.length === this.state.recentPaths.length) {
      return
    }

    this.setState({ recentPaths: nextRecentPaths }, () =>
      saveRecentPathsToStorage(this.props.repository, this.state.recentPaths)
    )
  }

  private onRecentPathRemoveButtonClicked = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    this.stopRecentPathDeletePropagation(event)

    const path = event.currentTarget.dataset.path
    if (path === undefined) {
      return
    }

    this.onRecentPathRemoved(path)
  }

  private onRecentPathRemoveButtonMouseDown = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    this.stopRecentPathDeletePropagation(event)
  }

  private stopRecentPathDeletePropagation(
    event: React.MouseEvent<HTMLButtonElement>
  ) {
    event.preventDefault()
    event.stopPropagation()
    event.nativeEvent.stopImmediatePropagation()
  }

  private getUpdatedRecentPaths(
    previousRecentPaths: ReadonlyArray<string>,
    path: string
  ): ReadonlyArray<string> {
    const normalizedPath = path.trim()
    if (normalizedPath.length === 0) {
      return previousRecentPaths
    }

    if (previousRecentPaths[0] === normalizedPath) {
      return previousRecentPaths
    }

    const nextRecentPaths = [
      normalizedPath,
      ...previousRecentPaths.filter(p => p !== normalizedPath),
    ].slice(0, MaxRecentPaths)

    if (
      nextRecentPaths.length === previousRecentPaths.length &&
      nextRecentPaths.every((value, index) => value === previousRecentPaths[index])
    ) {
      return previousRecentPaths
    }

    return nextRecentPaths
  }

  private toggleSortOrder = () => {
    this.setState(previousState => ({
      sortAscending: !previousState.sortAscending,
    }))
  }

  private onCommitSelected = (commit: Commit) => {
    this.setState({ selectedSha: commit.sha })

    this.props.dispatcher.changeCommitSelection(
      this.props.repository,
      [commit.sha],
      true
    )
    void this.props.dispatcher.loadChangedFilesForCurrentSelection(
      this.props.repository
    )
  }

  private onCommitRowClicked = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const sha = event.currentTarget.dataset.sha
    if (sha === undefined) {
      return
    }

    const commit = this.state.commits.find(c => c.sha === sha)
    if (commit === undefined) {
      return
    }

    this.onCommitSelected(commit)
  }

  private onCommitRowDoubleClicked = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const sha = event.currentTarget.dataset.sha
    if (sha === undefined) {
      return
    }

    this.props.onViewCommitOnGitHub(sha)
  }
}

function getCommitAuthorLabel(commit: Commit): string {
  const trimmedName = commit.author.name.trim()
  return trimmedName.length > 0 ? trimmedName : commit.author.email
}

function getDateThreshold(dateFilter: DateFilter): number | null {
  const now = Date.now()

  if (dateFilter === '24h') {
    return now - 24 * 60 * 60 * 1000
  }

  if (dateFilter === '7d') {
    return now - 7 * 24 * 60 * 60 * 1000
  }

  return null
}

function getDateFilterLabel(dateFilter: DateFilter): string {
  if (dateFilter === '24h') {
    return 'Last 24 hours'
  }

  if (dateFilter === '7d') {
    return 'Last 7 days'
  }

  return 'Date'
}

function getRecentPathsStorageKey(repository: Repository): string {
  return `${HistoryManagementRecentPathsKeyPrefix}-${repository.id}`
}

function loadRecentPathsFromStorage(
  repository: Repository
): ReadonlyArray<string> {
  return getStringArray(getRecentPathsStorageKey(repository))
    .map(path => path.trim())
    .filter(path => path.length > 0)
    .slice(0, MaxRecentPaths)
}

function saveRecentPathsToStorage(
  repository: Repository,
  recentPaths: ReadonlyArray<string>
) {
  const key = getRecentPathsStorageKey(repository)
  if (recentPaths.length === 0) {
    localStorage.removeItem(key)
    return
  }

  setStringArray(key, recentPaths)
}
