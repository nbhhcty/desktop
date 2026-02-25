import * as React from 'react'
import { Repository } from '../../models/repository'
import { Dispatcher, defaultErrorHandler } from '../dispatcher'
import { Button } from '../lib/button'

interface IStashManagementViewProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly selectedStashName: string | null
  readonly refreshToken: number
  readonly onRefreshRequested: () => void
}

interface IStashManagementViewState {
  readonly selectedPatch: string
  readonly isLoadingPatch: boolean
}

export class StashManagementView extends React.Component<
  IStashManagementViewProps,
  IStashManagementViewState
> {
  public constructor(props: IStashManagementViewProps) {
    super(props)

    this.state = {
      selectedPatch: '',
      isLoadingPatch: false,
    }
  }

  public componentDidMount() {
    this.loadPatchForSelected(this.props.selectedStashName)
  }

  public componentDidUpdate(prevProps: IStashManagementViewProps) {
    if (prevProps.repository.id !== this.props.repository.id) {
      this.setState(
        {
          selectedPatch: '',
          isLoadingPatch: false,
        },
        () => this.loadPatchForSelected(this.props.selectedStashName)
      )
      return
    }

    if (prevProps.selectedStashName !== this.props.selectedStashName) {
      this.loadPatchForSelected(this.props.selectedStashName)
      return
    }

    if (
      prevProps.refreshToken !== this.props.refreshToken &&
      this.props.selectedStashName !== null
    ) {
      this.loadPatch(this.props.selectedStashName)
    }
  }

  public render() {
    const { selectedPatch, isLoadingPatch } = this.state
    const selectedStashName = this.props.selectedStashName

    return (
      <div
        id="stash-management-view"
        role="tabpanel"
        aria-labelledby="stash-management-tab"
      >
        <div className="stash-management-toolbar">
          <h2>Stash Management</h2>
          <Button onClick={this.onRefresh}>Refresh</Button>
        </div>

        <section className="stash-management-section stash-management-preview">
          <h3>Patch Preview</h3>
          <div className="stash-management-command-list">
            <code>git stash show -p stash@{'{n}'}</code>
          </div>
          {isLoadingPatch ? (
            <div className="stash-management-placeholder">Loading patch...</div>
          ) : selectedStashName === null ? (
            <div className="stash-management-placeholder">
              Select a stash entry from the left sidebar to preview.
            </div>
          ) : (
            <pre>{selectedPatch}</pre>
          )}
        </section>
      </div>
    )
  }

  private onRefresh = () => {
    this.props.onRefreshRequested()

    const stashName = this.props.selectedStashName
    if (stashName !== null) {
      this.loadPatch(stashName)
    }
  }

  private loadPatchForSelected(selectedStashName: string | null) {
    if (selectedStashName === null) {
      this.setState({
        selectedPatch: '',
        isLoadingPatch: false,
      })
      return
    }

    this.loadPatch(selectedStashName)
  }

  private async loadPatch(stashName: string) {
    this.setState({ isLoadingPatch: true })

    try {
      const patch = await this.props.dispatcher.getStashPatch(
        this.props.repository,
        stashName
      )

      this.setState(() =>
        this.props.selectedStashName === stashName
          ? {
              selectedPatch: patch,
              isLoadingPatch: false,
            }
          : null
      )
    } catch (error) {
      this.setState({ isLoadingPatch: false })
      await defaultErrorHandler(this.coerceToError(error), this.props.dispatcher)
    }
  }

  private coerceToError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error))
  }
}
