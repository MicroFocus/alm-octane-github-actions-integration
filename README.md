# alm-octane-github-actions-integration
Custom GitHub action which facilitates communication between GitHub and ALM Octane/ValueEdge regarding CI/CD.

&nbsp;[Requirements](#Requirements)

&nbsp;[Workflow Configuration](#Workflow-Configuration)

&nbsp;[Change log](#Change-log)
- [v24.4.1](#v2421)
- [v24.4.0](#v24240)
- [v24.2.0](#v2420)
- [v23.3.0](#v2330)
- [v1.0](#v10)

## Requirements
- At least one GitHub runner allocated for running the integration.
- ALM Octane version 16.1.200 or higher (certain features require a newer version - see documentation)
- ALM Octane API Access with CI/CD Integration and DevOps Admin roles.

## Workflow Configuration
### Note: these steps should be done inside your GitHub repository.
- Create a new workflow (.yml file).
- Add workflow_run trigger on the desired workflow(s) on request and complete events.
- Add pull_request event trigger to also notify the integration of any PR related event.

```yaml
on:
  workflow_run:
    workflows: [<workflow_name1>, <workflow_name2>, ...]
    types: [requested, in_progress, completed]
  pull_request:
    types: [opened, edited, closed, reopened]
```
- If ALM Octane is configured on HTTPS with a self-signed certificate, configure node to allow requests to the server.

```yaml
env: 
    NODE_TLS_REJECT_UNAUTHORIZED: 0
```
- Add a job for ALM Octane integration and configure details about the runner.
- Configure two secret variables named ALM_OCTANE_CLIENT_ID and ALM_OCTANE_CLIENT_SECRET with the credential values, inside your GitHub repository (more details about
secret variables configuration [here](https://docs.github.com/en/actions/security-guides/encrypted-secrets)).
- Set integration config params (ALM Octane URL, Shared Space, Workspace, credentials) and repository (Token and URL).
- Set unitTestResultsGlobPattern to match desired Test Results path.
- For Private repositories go to ```Settings -> Actions -> General``` and set your GITHUB_TOKEN permissions to Read and write. This is necessary to access the actions scope. (more details about GITHUB_TOKEN permissions [here](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token))

```yaml
jobs:
  octane_integration_job:
    runs-on: <runner_tags>
    name: OctaneIntegration#${{github.event.action}}#${{github.event.workflow_run.id}}
    steps:
      - name: GitHub Actions ALM Octane Integration
        uses: MicroFocus/alm-octane-github-actions-integration
        id: gitHubActionsIntegration
        with:
          octaneUrl: <alm_octane_URL>
          octaneSharedSpace: <alm_octane_shared_space>
          octaneWorkspace: <alm_octane_workspace>
          octaneClientId: ${{secrets.ALM_OCTANE_CLIENT_ID}}
          octaneClientSecret: ${{secrets.ALM_OCTANE_CLIENT_SECRET}}
          githubToken: ${{secrets.GITHUB_TOKEN}}
          serverBaseUrl: <github_repository_URL>
          pipelineNamePattern: '${workflow_name}'
          unitTestResultsGlobPattern: <pattern_for_test_result_path>
```

Example of complete integration workflow configuration file:

```yaml
name: OctaneIntegration
# Events the integration should be triggered on
on:
  pull_request:
    types: [opened, edited, closed, reopened]
  workflow_run:
    # List of workflows to integrate with ALM Octane
    workflows: [CI]
    types: [requested, in_progress, completed]
# Node configuration for allowing HTTPS requests
env: 
    NODE_TLS_REJECT_UNAUTHORIZED: 0
jobs:
  octane_integration_job:
    # List of runner tags
    runs-on: [self-hosted]
    name: OctaneIntegration#${{github.event.action}}#${{github.event.workflow_run.id}}
    steps:
      - name: GitHub Actions ALM Octane Integration
        # Reference to our public GitHub action
        uses: MicroFocus/alm-octane-github-actions-integration
        id: gitHubActionsIntegration
        # Config parameters for the integration
        with:
          # ALM Octane connection data
          octaneUrl: 'http://myOctaneUrl.com'
          octaneSharedSpace: 1001
          octaneWorkspace: 1002
          octaneClientId: ${{secrets.ALM_OCTANE_CLIENT_ID}}
          octaneClientSecret: ${{secrets.ALM_OCTANE_CLIENT_SECRET}}
          # Automatically provided GitHub token
          githubToken: ${{secrets.GITHUB_TOKEN}}
          # The url that the CI Server in ALM Octane will point to
          serverBaseUrl: https://github.com/MyUser/MyCustomRepository
          # Pattern for building the name of the pipeline (see README for full list of placeholders)
          pipelineNamePattern: '${workflow_name}'
          # Pattern for identifying JUnit style report files for test result injection in ALM Octane
          unitTestResultsGlobPattern: "**/*.xml"
```
- Run the desired workflow(s) from Actions Tab. This will create a new CI Server and pipeline inside ALM Octane, reflecting the status of the executed workflow.

### Pipeline name pattern

- The `pipelineNamePattern` parameter from the integration workflow configuration represents the format of the pipeline name that will be displayed in the OpenText Software Delivery Platform.

- This parameters can contain any combination of the following placeholders:
1. `${repository_name}` - the name of the repository
2. `${repository_owner}` - the name of the account or organization owning the repository.
1. `${workflow_name}` - the name of the workflow.
2. `${workflow_file_name}` - the name of the workflow's configuration file.

- Example: `NEW - ${repository_name} - ${workflow_name}`

## Limitations
- Needs at least one dedicated GitHub runner to execute the integration workflow.
- On each pipeline run, the commits that happened since the previous ALM Octane build will be injected. For that, at least one ALM Octane build needs to exist (the commits will be injected starting from the second run of the pipeline with the integration).
- Commits from secondary branches will be injected by running the workflow on the desired branch.

## Change log

### v24.4.1
 - Added a new configuration parameter for configuring logging level. It's named `logLevel` and is an optional parameter.
 - Fixed issue with workflows running in serial mode not being fully reflected in OpenText Software Delivery Platform.

### v24.4.0
 - Added a new configuration parameter for customizing the pipeline's name. (the one displayed in the OpenText Software Delivery Platform)
 - Added migration process for multi-branch pipelines.
 - Added migration process for splitting existing CI servers to per-organization or per-account CI servers.
 - Running GitHub workflows from the OpenText Software Delivery Platform is now available.

### v24.2.0
 - Added support for multi branch pipelines.
 - Fixed issue that caused completion workflows not to finish.
 - Updated Node.js to v20.

### v23.3.0
 - Rebranding.
 - Fixed issue with logs when connection to ALM Octane was failing.
 
### v1.0
- Creates CI server and pipelines, and reflects pipeline run status in ALM Octane.
- Injects JUnit test results.
- Injects SCM data (commits and branches).
- Injects pull requests on GitHub PR events.
