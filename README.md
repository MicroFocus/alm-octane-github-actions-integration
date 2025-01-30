## 1. Introduction 🚀
In the following documentation, the **OpenText Core Software Delivery Platform** and **OpenText Software Delivery Management** will collectively be referred to as 'the product'.

This is a custom GitHub Action which facilitates communication between GitHub and the product (formelly known as ALM Octane/ValueEdge) regarding CI/CD. The action will monitor an automation workflow and will reflect it into the product.

## 2. Table of Contents

- [1. Introduction](#1-introduction-)
- [2. Table of Contents](#2-table-of-contents)
- [3. Requirements](#3-requirements)
- [4. Workflow Configuration](#4-workflow-configuration)
  - [4.1. Example Workflow Configuration](#41-example-workflow-configuration)
  - [4.2. Pipeline name pattern](#42-pipeline-name-pattern)
  - [4.3. Injecting Gherkin (BDD) test results](#43-injecting-gherkin-bdd-test-results)
  - [4.4. Debugging](#44-debugging)
- [5. Credential Configuration](#5-credential-configuration-into-the-product)
  - [5.1. Creating a GitHub App](#51-creating-a-github-app)
  - [5.2. Installing a GitHub App to specific repositories](#52-installing-a-github-app-to-specific-repositories)
  - [5.3. Configure the credential into the product](#53-configure-the-credential-into-the-product)
- [6. Running Automated Tests](#6-running-automated-tests-from-the-product)
- [7. Limitations](#7-limitations)
- [8. Change log](#8-change-log)
  - [v25.1.1](#v2511)
  - [v25.1.0](#v2510)
  - [v24.4.1](#v2441)
  - [v24.4.0](#v2440)
  - [Older versions](#v2420)

## 3. Requirements
- At least one GitHub Actions runner allocated for running the integration.
- the product version should be **16.1.200** or **higher** (certain features require a newer version - see documentation)
- API access to the product with **CI/CD Integration** or **DevOps Admin** roles.

## 4. Workflow Configuration
> [!NOTE]
> These steps should be done inside your GitHub repository.

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
- If the product is configured on HTTPS with a self-signed certificate, configure node to allow requests to the server.

```yaml
env: 
    NODE_TLS_REJECT_UNAUTHORIZED: 0
```
- Add a job for the product's integration and configure details about the runner.
- Configure two secret variables named ALM_OCTANE_CLIENT_ID and ALM_OCTANE_CLIENT_SECRET with the credential values, inside your GitHub repository (more details about
secret variables configuration [here](https://docs.github.com/en/actions/security-guides/encrypted-secrets)).
- Set integration config params (the product's URL, Shared Space, Workspace, credentials) and repository (Token and URL).
- Set `unitTestResultsGlobPattern` to match desired **JUnit** test results path or set `gherkinTestResultsGlobPattern` to match **Gherkin (BDD)** test results path ([see more](#injecting-gherkin-bdd-test-results)).
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
          unitTestResultsGlobPattern: <pattern_for_junit_test_result_path>
          gherkinTestResultsGlobPattern: <pattern_for_gherkin_test_result_path>
```

### 4.1. Example Workflow Configuration

Example of complete integration workflow configuration file:

```yaml
name: OpenText Software Delivery Platform Integration
# Events the integration should be triggered on
on:
  pull_request:
    types: [opened, edited, closed, reopened]
  workflow_run:
    # List of workflows to integrate with OpenText Core SDP / SDM
    workflows: [CI]
    # For automated tests, the requested and in_progress types are not required
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
          # OpenText Core SDP / SDM connection data
          octaneUrl: 'http://myOctaneUrl.com'
          octaneSharedSpace: 1001
          octaneWorkspace: 1002
          octaneClientId: ${{secrets.ALM_OCTANE_CLIENT_ID}}
          octaneClientSecret: ${{secrets.ALM_OCTANE_CLIENT_SECRET}}
          # Automatically provided GitHub token
          githubToken: ${{secrets.GITHUB_TOKEN}}
          # The url that the CI Server in OpenText Core SDP will point to
          serverBaseUrl: https://github.com/MyUser/MyCustomRepository
          # Pattern for building the name of the pipeline (see README for full list of placeholders)
          pipelineNamePattern: '${workflow_name}'
          # Pattern for identifying JUnit style report files for test result injection in OpenText Core SDP
          unitTestResultsGlobPattern: "**/*.xml"
```

- In order to save the parameters of the pipelines and reflect them in the product, update your pipeline's configuration to contain this step in one of the pipeline's jobs:

```yaml
    - name: Log workflow execution parameters
      run: |
        echo "execution_parameter:: $(echo '${{ toJson(github.event.inputs) }}' | jq -c .)"
```

- Run the desired workflow(s) from Actions Tab. This will create a new CI Server and pipeline inside the product, reflecting the status of the executed workflow.

### 4.2. Pipeline name pattern

- The `pipelineNamePattern` parameter from the integration workflow configuration represents the format of the pipeline name that will be displayed in the product.

- This parameter can contain any combination of the following placeholders:
1. `${repository_name}` - the name of the repository
2. `${repository_owner}` - the name of the account or organization owning the repository.
1. `${workflow_name}` - the name of the workflow.
2. `${workflow_file_name}` - the name of the workflow's configuration file.

- Example: `NEW - ${repository_name} - ${workflow_name}`


### 4.3. Injecting Gherkin (BDD) test results

- To inject **Gherkin** test results, follow these steps:
  1. The automation workflow must contain an additional step for converting the BDD test results to a format accepted by the product. This step must run the [bdd2octane](https://github.com/MicroFocus/bdd2octane?tab=readme-ov-file#a-tool-that-enables-importing-bdd-test-results-into-alm-octane) tool.
  ```yaml
  - name: Convert BDD test results
    run: mvn com.microfocus.adm.almoctane.bdd:bdd2octane:run -DreportFiles="**/target/surefire-reports/*.xml" -DfeatureFiles="**/src/test/resources/features/*.feature" -Dframework="cucumber-jvm" -DresultFile="target/surefire-reports/cucumber-jvm-result.xml"
  ```
  2. Set up the `gherkinTestResultsGlobPattern` parameter in the integration workflow to match the converted test results.

### 4.4. Debugging

- In order to get more information on the execution of the integration workflow, add this parameter for the integration job: `logLevel: '3'`.
- These are the available values for this parameter:
  - `1` - trace level
  - `2` - debug level
  - `3` - info level
  - `4` - warning level
  - `5` - error level

## 5. Credential Configuration into the product

- To use certain features, the product needs to send requests to GitHub. This requires configuring a GitHub App credential and adding it to the application.

### 5.1. Creating a GitHub App

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

### 5.2. Installing a GitHub App to specific repositories

1. On GitHub, go to your organization (or account, if the repository containing the workflows is owned by an account) settings.
2. Go to **Developer settings -> GitHub App**.
3. Select the credential you created in the previous step by clicking on its name.
4. In the left-side menu, go to **Install App**.
5. For the organization (or account) you want to configure the credential for, click on the **Install** button.
6. Select the repositories you want to grant access to: **All repositories** or **Only select repositories**
7. Click on the `Install` button to complete the installation.

### 5.3. Configure the credential into the product

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

## 6. Running Automated Tests from the product

1. **Configure Workflow Parameters:**
   - Ensure the parameters required for automated tests are properly set up in **automation** workflow as described earlier.
   - The workflow must include the following parameters:
     - `testsToRun` (type: string)
     - `suiteId` (type: number)
     - `suiteRunId` (type: number)
     - `executionId` (type: number)  
   - For numerical parameters, it is recommended to set a default value of `0`.

2. **Configure the `testToRun` conversion job**:
   - To run the tests selected into the product, include a job for converting the `testsToRun` parameter to a format accepted by your testing framework. This should be done into your automation framework.
   - More details on how to do this step can be found here: [@opentext/sdp-sdm-tests-to-run-conversion](https://github.com/MicroFocus/sdp-sdm-tests-to-run-conversion?tab=readme-ov-file#42-running-the-tool-with-github-actions).

3. **Set Up for GitHub Actions Integration:**
   - To integrate GitHub Actions with the product as a test runner, include the `testingFramework` parameter in your workflow configuration.  
   - The `testingFramework` parameter should be set to one of the following values, based on the testing tool used:
     - `cucumber`
     - `bddScenario` (for Cucumber with BDD scenario)
     - `gradle`
     - `jbehave`
     - `junit`
     - `protractor`
     - `testNG` (Selenium)
   - Based on the test results format, you should configure at least one of the following parameters to see the test results in the product:
     - If you want to inject **JUnit** test results, set the `unitTestResultsGlobPattern` parameter.
     - If you want to inject **Gherkin (BDD)** test results, set the `gherkinTestResultsGlobPattern` parameter. ([see more](#injecting-gherkin-bdd-test-results))

4. **Run the Workflow:**
   - After completing the configuration, run your workflow. This will create a **test runner entity** in the product.

5. **Link Automated Test Entities:**
   - Link automated test entities in the product to the newly created test runner.  
   - Automated test entities can be created in two ways:
     - Manually within the product.
     - Automatically by running tests once in GitHub Actions without configuring the test runner parameters mentioned above (the integration should be configured for the pipeline flow, not the test runner flow).

## 7. Limitations
- Needs at least one dedicated GitHub runner to execute the integration workflow.
- On each pipeline run, the commits that happened since the previous build in the product will be injected. For that, at least one build needs to exist in the product (the commits will be injected starting from the second run of the workflow with the integration).
- Commits from secondary branches will be injected by running the workflow on the desired branch.

## 8. Change log

### v25.1.1

 - Added functionality for running automated tests from the product.
 - Added support for injecting Gherkin test results from GitHub Actions.

### v25.1.0

 - Added functionality for saving pipeline parameters in the product.

### v24.4.1
 - Added a new configuration parameter for configuring logging level. It's named `logLevel` and is an optional parameter.
 - Fixed issue with workflows running in serial mode not being fully reflected in the product.

### v24.4.0
 - Added a new configuration parameter for customizing the pipeline's name. (the one displayed in the product)
 - Added migration process for multi-branch pipelines.
 - Added migration process for splitting existing CI servers to per-organization or per-account CI servers.
 - Running GitHub workflows from the OpenText Software Delivery Platform is now available.

### v24.2.0
 - Added support for multi branch pipelines.
 - Fixed issue that caused completion workflows not to finish.
 - Updated Node.js to v20.

### v23.3.0
 - Rebranding.
 - Fixed issue with logs when connection to the product was failing.
 
### v1.0
- Creates CI server and pipelines, and reflects pipeline run status in the product.
- Injects JUnit test results.
- Injects SCM data (commits and branches).
- Injects pull requests on GitHub PR events.
