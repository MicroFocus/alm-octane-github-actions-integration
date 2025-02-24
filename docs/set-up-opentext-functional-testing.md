## 1. Introduction

In the following documentation, the **OpenText Core Software Delivery Platform** and **OpenText Software Delivery Management** will collectively be referred to as 'the product'.

This guide explains how to configure the product's GitHub Actions integration to inject OpenText Functional Testing results and execute tests using this framework.

## 2. Table of Contents

- [1. Introduction](#1-introduction-)
- [2. Table of Contents](#2-table-of-contents)
- [2. Requirements](#2-requirements)
- [4. Workflow Configuration](#4-workflow-configuration)
- [4.1. Key Configuration Steps](#41-key-configuration-steps)
- [4.2. Example Workflow Configuration](#42-example-workflow-configuration)
- [5. Running Automated Tests](#5-running-automated-tests)
- [5.1. Example Workflow Configuration](#51-example-workflow-configuration)

## 3. Requirements

- All requirements specified [here](https://github.com/MicroFocus/alm-octane-github-actions-integration?tab=readme-ov-file#3-requirements).
- A self-hosted GitHub runner with OpenText Functional Testing installed.

## 4. Workflow Configuration

> [!NOTE]
> These steps should be performed inside your GitHub repository, within the automation workflow.  
> Additionally, configure the integration workflow as described [here](https://github.com/MicroFocus/alm-octane-github-actions-integration?tab=readme-ov-file#4-workflow-configuration).

### 4.1. Key Configuration Steps

1. The workflow should start by printing its parameters for tracking in the product’s pipeline.
2. The workflow utilizes [ADM-FT-ToolsLauncher](https://github.com/MicroFocus/ADM-FT-ToolsLauncher/) to run functional tests.
3. A properties `.txt` file is created to specify:
   - The tests to run.
   - The path to store test results.
   - The `resultTestNameOnly` and `resultUnifiedTestClassname` options set to `true`.
4. The test results file should be archived as an artifact for the integration to retrieve and send results to the product.

### 4.2. Example Workflow Configuration

```yaml
name: Automation Workflow

on:
  workflow_dispatch:

env:
  PROPS_TXT: FT-test-props.txt
  RES_XML: FT-test-results.xml
  LAUNCHER_EXE: FTToolsLauncher.exe
  LAUNCHER_URL: https://github.com/MicroFocus/ADM-FT-ToolsLauncher/releases/download/v24.2.0/FTToolsLauncher_net48.exe

defaults:
  run:
    working-directory: .\

jobs:
  run-tests:
    runs-on: [ self-hosted, ft-runner ]
    steps:
    - name: Log workflow inputs for Octane
      run: |
        $inputs = ConvertFrom-Json -InputObject '${{ toJson(github.event.inputs) }}'
        Write-Host "execution_parameter:: $($inputs | ConvertTo-Json -Compress)"
      
    - name: Checkout current repo
      uses: actions/checkout@v4
      with:
        ref: ${{github.ref_name}}
        clean: false
        
    - name: Create properties file (UTF-8)
      shell: powershell
      run: |
        $content = @"
        runType=FileSystem
        resultsFilename=$($env:RES_XML)
        Test1=$($pwd.Path.Replace('\', '\\') + '\\first_test')
        Test2=$($pwd.Path.Replace('\', '\\') + '\\second_test')
        resultTestNameOnly=true
        resultUnifiedTestClassname=true
        "@

        # Save file with UTF-8 encoding
        $content | Out-File -FilePath $env:PROPS_TXT -Encoding utf8
  
    - name: Check properties file
      shell: powershell
      run: |
        if (Test-Path $env:PROPS_TXT) {
          Write-Host "Properties file created successfully!"
          Get-Content $env:PROPS_TXT
        } else {
          Write-Error "Properties file was not created!"
          exit 1
        }

    - name: Download Functional Testing tool
      shell: powershell
      run:  if (TEST-PATH $env:LAUNCHER_EXE) {
              echo "FTToolsLauncher.exe already exists"
            } else {
              Invoke-WebRequest -Uri $env:LAUNCHER_URL -OutFile $env:LAUNCHER_EXE
            }

    - name: Run Functional Testing tool
      id: run-tests
      shell: powershell
      run: |
        $process = Start-Process -FilePath "$env:LAUNCHER_EXE" `
          -ArgumentList "-paramfile $env:PROPS_TXT" `
          -NoNewWindow -PassThru *>&1

        # Wait for the process to complete
        $process | Wait-Process

        # Capture Exit Code
        "X=$($process.ExitCode)" >> $env:GITHUB_OUTPUT
  
    - if: ${{ steps.run-tests.outputs.X != 0 }}
      uses: actions/github-script@v6
      with:
        script: |
          core.setFailed('The job run-tests failed with status ${{ steps.run-tests.outputs.X }} !')
      continue-on-error: true
          
    - name: Archive Functional Test results
      uses: actions/upload-artifact@v4
      with:
        name: junit-test-report
        path: ${{ $env.RES_XML }}
      continue-on-error: true
```

## 5. Running Automated Tests

For executing automated tests directly from the product:

1. Include the following parameters in the automation workflow:
    - `testsToRun`
    - `suiteRunId`
    - `executionId`
    - `suiteId`

```yaml
on:
  workflow_dispatch:
    inputs:
      testsToRun:
        description: 'Tests to run (from OpenText SDP/SDM)'
        required: true
        default: ''
      suiteRunId:
        description: 'Suite Run Id (from OpenText SDP/SDM)'
        required: true
        default: '0'
      executionId:
        description: 'Execution Id (from OpenText SDP/SDM)'
        required: true
        default: '0'
      suiteId:
        description: 'Suite Id (from OpenText SDP/SDM)'
        required: true
        default: '0'
```

2. Add a step to convert the `testsToRun` parameter using the [sdp-sdm-tests-to-run-conversion](https://github.com/MicroFocus/sdp-sdm-tests-to-run-conversion?tab=readme-ov-file#1-introduction-) tool.

3. Store the output in an `.mtbx` file and reference it in the properties file of the `FTToolLauncher` executable.

```yaml
...
env:
  TESTS_TO_RUN_MTBX: testsToRun.mtbx
...
 
jobs:
  run-tests:
    runs-on: [ self-hosted, ft-runner ]
    steps:
    ...
    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '22'

    - name: Convert testsToRun parameter
      id: convert_tests
      run: |
        # Run the node command and capture its output
        $output = npx @opentext/sdp-sdm-tests-to-run-conversion --framework="uft" --testsToRun="${{ github.event.inputs.testsToRun }}" --logLevel=0

        Write-Host "Node output: $output"
        $output | Out-File -FilePath $env:TESTS_TO_RUN_MTBX -Encoding utf8
        # Write the output to the GITHUB_ENV file
        # echo "converted_tests=$output" >> $env:GITHUB_ENV
    ...
```

4. Once the automation workflow has been properly configured, manually trigger the **automation workflow** on GitHub. Running this workflow will automatically create the test runner within the product.

5. To allow the product to interact with the GitHub Actions API, configure the necessary credentials. ([see more](https://github.com/MicroFocus/alm-octane-github-actions-integration?tab=readme-ov-file#5-credential-configuration-into-the-product))

6. The test runner created in step `5.` needs to be linked to automated tests. These tests should have already been injected using a separate workflow that scans and collects all tests in the repository.

### 5.1. Example Workflow Configuration

```yaml
name: Test Runner Workflow

on:
  workflow_dispatch:
    inputs:
      testsToRun:
        description: 'Tests to run (from OpenText SDP/SDM)'
        required: true
        default: ''
      suiteRunId:
        description: 'Suite Run Id (from OpenText SDP/SDM)'
        required: true
        default: '0'
      executionId:
        description: 'Execution Id (from OpenText SDP/SDM)'
        required: true
        default: '0'
      suiteId:
        description: 'Suite Id (from OpenText SDP/SDM)'
        required: true
        default: '0'

env:
  TESTS_TO_RUN_MTBX: testsToRun.mtbx
  PROPS_TXT: FT-test-props.txt
  RES_XML: FT-test-results.xml
  LAUNCHER_EXE: FTToolsLauncher.exe
  LAUNCHER_URL: https://github.com/MicroFocus/ADM-FT-ToolsLauncher/releases/download/v24.2.0/FTToolsLauncher_net48.exe

defaults:
  run:
    working-directory: .\

jobs:
  run-tests:
    runs-on: [ self-hosted, ft-runner ]
    steps:
    - name: Log workflow inputs for Octane
      run: |
        $inputs = ConvertFrom-Json -InputObject '${{ toJson(github.event.inputs) }}'
        Write-Host "execution_parameter:: $($inputs | ConvertTo-Json -Compress)"
      
    - name: Checkout current repo
      uses: actions/checkout@v4
      with:
        ref: ${{github.ref_name}}
        clean: false

    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '22'

    - name: Convert testsToRun parameter
      id: convert_tests
      run: |
        # Run the node command and capture its output
        $output = npx @opentext/sdp-sdm-tests-to-run-conversion --framework="uft" --testsToRun="${{ github.event.inputs.testsToRun }}" --logLevel=0

        Write-Host "Node output: $output"
        $output | Out-File -FilePath $env:TESTS_TO_RUN_MTBX -Encoding utf8
        # Write the output to the GITHUB_ENV file
        # echo "converted_tests=$output" >> $env:GITHUB_ENV
        
    - name: Create properties file (UTF-8)
      shell: powershell
      run: |
        $content = @"
        runType=FileSystem
        resultsFilename=$($env:RES_XML)
        Test1=$($pwd.Path.Replace('\', '\\') + '\\' + $env:TESTS_TO_RUN_MTBX)
        resultTestNameOnly=true
        resultUnifiedTestClassname=true
        "@

        # Save file with UTF-8 encoding
        $content | Out-File -FilePath $env:PROPS_TXT -Encoding utf8
  
    - name: Check properties file
      shell: powershell
      run: |
        if (Test-Path $env:PROPS_TXT) {
          Write-Host "Properties file created successfully!"
          Get-Content $env:PROPS_TXT
        } else {
          Write-Error "Properties file was not created!"
          exit 1
        }

    - name: Download Functional Testing tool
      shell: powershell
      run:  if (TEST-PATH $env:LAUNCHER_EXE) {
              echo "FTToolsLauncher.exe already exists"
            } else {
              Invoke-WebRequest -Uri $env:LAUNCHER_URL -OutFile $env:LAUNCHER_EXE
            }

    - name: Run Functional Testing tool
      id: run-tests
      shell: powershell
      run: |
        $process = Start-Process -FilePath "$env:LAUNCHER_EXE" `
          -ArgumentList "-paramfile $env:PROPS_TXT" `
          -NoNewWindow -PassThru *>&1

        # Wait for the process to complete
        $process | Wait-Process

        # Capture Exit Code
        "X=$($process.ExitCode)" >> $env:GITHUB_OUTPUT
  
    - if: ${{ steps.run-tests.outputs.X != 0 }}
      uses: actions/github-script@v6
      with:
        script: |
          core.setFailed('The job run-tests failed with status ${{ steps.run-tests.outputs.X }} !')
      continue-on-error: true
          
    - name: Archive Functional Test results
      uses: actions/upload-artifact@v4
      with:
        name: junit-test-report
        path: ${{ $env.RES_XML }}
      continue-on-error: true
```