# alm-octane-github-actions-integration
Custom GitHub action which facilitates communication between GitHub and ALM Octane/ValueEdge regarding CI/CD.

## Table of Contents

- [Requirements](#requirements)
- [Workflow Configuration](#workflow-configuration)
- [Credential Configuration](#credential-configuration-for-opentext-software-delivery-platform)
- [Change log](#change-log)
  - [v24.4.2](#v2442)
  - [v24.4.1](#v2441)
  - [v24.4.0](#v2440)
  - [v24.2.0](#v2420)
  - [v23.3.0](#v2330)
  - [v1.0](#v10)

## Requirements
- At least one GitHub runner allocated for running the integration.
- ALM Octane version 16.1.200 or higher (certain features require a newer version - see documentation)
- ALM Octane API Access with CI/CD Integration and DevOps Admin roles.

## Workflow Configuration
> ***Note: these steps should be done inside your GitHub repository.***
- Create a new workflow (.yml file).
- Add `workflow_run` trigger on the desired workflow(s) on request and complete events.
- Add `pull_request` event trigger to also notify the integration of any PR related event.

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

## Credential Configuration for OpenText Software Delivery Platform

- To use certain features, the OpenText Software Delivery Platform needs to send requests to GitHub. This requires configuring a GitHub App credential and adding it to the application.

### Creating a GitHub App

1. On GitHub, go to your organization (or account, if the repository containing the workflows is owned by an account) settings.
2. In the left-side menu, go to **Developer Settings -> GitHub Apps**.
3. Create a new GitHub App by clicking on **New GitHub App**.
4. In the **GitHub App name** field, enter a name of your choice.
5. In the **Homepage URL** field, enter the URL of the Opentext Software Delivery Platform.
6. In the **Webhook** section, uncheck the **Active** option. No webhook is needed.
7. In the **Permissions** section, grant the following repository permissions:
  - Actions: Read and write
  - Content: Read-only
8. Click on the **Create GitHub App** button at the bottom of the page. Leave any other fields unchanged.

### Installing a GitHub App to specific repositories

1. On GitHub, go to your organization (or account, if the repository containing the workflows is owned by an account) settings.
2. Go to **Developer settings -> GitHub App**.
3. Select the credential you created in the previous step by clicking on its name.
4. In the left-side menu, go to **Install App**.
5. For the organization (or account) you want to configure the credential for, click on the **Install** button.
6. Select the repositories you want to grant access to: **All repositories** or **Only select repositories**
7. Click on the `Install` button to complete the installation.

### Configure the credential in Opentext Software Delivery Platform

1. On GitHub, go to your organization (or account, if the repository containing the workflows is owned by an account) settings.
2. Go to **Developer Settings -> GitHub Apps** and select the GitHub App you installed by clicking on its name.
3. On the current page, note the value of the **Client ID**.
4. In the **Private keys** section, click on **Generate a private key**. A file containing the private key will be downloaded to your device.
5. Go to the OpenText Software Delivery Platform.
6. Navigate to **Settings -> Spaces** (select the desired workspace containing the CI servers) **-> Credentials**.
7. Create a new credential.
8. Enter a name of your choice. In the **User Name** field, enter the **Client ID** from the GitHub App, and in the **Password** field, enter the private key generated for this GitHub App.
9. Click on the `Add` button to create the credential.
10. In workspace settings, go to **DevOps -> CI Servers**.
11. For the desired CI server (it has the name of the organization on GitHub), double-click on the cell in the **Credential** column and select the newly created credential. If the **Credential** column is not visible, click on the **Choose Columns** button (near the **Filter** button) and make the column visible.

## Limitations
- Needs at least one dedicated GitHub runner to execute the integration workflow.
- On each pipeline run, the commits that happened since the previous ALM Octane build will be injected. For that, at least one ALM Octane build needs to exist (the commits will be injected starting from the second run of the pipeline with the integration).
- Commits from secondary branches will be injected by running the workflow on the desired branch.

## Change log

### v24.4.2
 - Fixed issue that caused skipped test cases to be treated as passed.

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
