/*
 * Copyright 2016-2024 Open Text.
 *
 * The only warranties for products and services of Open Text and
 * its affiliates and licensors (“Open Text”) are as may be set forth
 * in the express warranty statements accompanying such products and services.
 * Nothing herein should be construed as constituting an additional warranty.
 * Open Text shall not be liable for technical or editorial errors or
 * omissions contained herein. The information contained herein is subject
 * to change without notice.
 *
 * Except as specifically indicated otherwise, this document contains
 * confidential information and a valid license is required for possession,
 * use or copying. If this work is provided to the U.S. Government,
 * consistent with FAR 12.211 and 12.212, Commercial Computer Software,
 * Computer Software Documentation, and Technical Data for Commercial Items are
 * licensed to the U.S. Government under vendor's standard commercial license.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *   http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import AdmZip from 'adm-zip';
import {
  convertGherkinXMLToOctaneXML,
  convertJUnitXMLToOctaneXML
} from '@microfocus/alm-octane-test-result-convertion';
import fsExtra from 'fs-extra';
import glob from 'glob-promise';
import GitHubClient from '../client/githubClient';
import OctaneClient from '../client/octaneClient';
import { getConfig } from '../config/config';
import { Logger } from '../utils/logger';

const LOGGER: Logger = new Logger('testResultsService');

const ARTIFACTS_DIR = 'artifacts';

const processArtifacts = async (
  owner: string,
  repo: string,
  workflowRunId: number
) => {
  LOGGER.info(
    `Starting artifact processing for workflowRunId: ${workflowRunId}, repository: ${owner}/${repo}`
  );

  const runArtifacts = await GitHubClient.getWorkflowRunArtifacts(
    owner,
    repo,
    workflowRunId
  );

  LOGGER.info(`Found ${runArtifacts.length} artifacts for processing.`);
  fsExtra.ensureDirSync(ARTIFACTS_DIR);

  for (const artifact of runArtifacts) {
    const fileName = `${ARTIFACTS_DIR}/${artifact.name}.zip`;
    LOGGER.debug(`Downloading artifact: ${artifact.name} (ID: ${artifact.id})`);

    const artifactZipBytes = await GitHubClient.downloadArtifact(
      owner,
      repo,
      artifact.id
    );
    fsExtra.writeFileSync(fileName, Buffer.from(artifactZipBytes));

    LOGGER.debug(`Extracting artifact: ${artifact.name}`);
    const zip = new AdmZip(fileName);
    zip.extractAllTo(ARTIFACTS_DIR);

    LOGGER.debug(`Cleaning up temporary zip file: ${fileName}`);
    fsExtra.rmSync(fileName);
  }

  LOGGER.info('Artifact processing completed.');
};

const findReportFiles = async (pattern: string): Promise<string[]> => {
  LOGGER.info(
    `Initiating search for test result files using pattern: '${pattern}'`
  );

  if (!pattern) {
    throw new Error('Test Results file pattern is not configured!');
  }

  const globSearchDestination = `${process.cwd()}/${ARTIFACTS_DIR}`;
  const reportFiles = await glob(pattern, {
    cwd: globSearchDestination
  });

  LOGGER.info(
    `Search completed. Found ${reportFiles.length} test result files matching the pattern.`
  );

  return reportFiles;
};

const sendTestResults = async (
  reportFiles: string[],
  convertFunction: (
    content: string,
    options: any,
    ...extraParams: any[]
  ) => string,
  serverId: string,
  buildId: string,
  jobId: string,
  extraConvertParams: any[] = []
) => {
  LOGGER.info(
    `Starting test results conversion and transmission for ${reportFiles.length} files.`
  );

  for (const reportFile of reportFiles) {
    LOGGER.debug(`Reading test results file: '${reportFile}'`);
    const fileContent = fsExtra.readFileSync(
      `${ARTIFACTS_DIR}/${reportFile}`,
      'utf-8'
    );

    LOGGER.debug(`Converting test results file: '${reportFile}'`);
    const convertedXML = convertFunction(
      fileContent,
      {
        server_id: serverId,
        build_id: buildId,
        job_id: jobId
      },
      ...extraConvertParams
    );

    LOGGER.debug(
      `Sending converted test results for file '${reportFile}' and serverId '${serverId}'`
    );

    await OctaneClient.sendTestResult(
      convertedXML,
      serverId,
      jobId,
      buildId
    ).catch(error => {
      LOGGER.error(
        `Failed to send test results. Check if the 'testingFramework' parameter is configured in the integration workflow. Error: ${error}`
      );
    });
  }

  LOGGER.info('All test results have been sent successfully.');
  fsExtra.emptyDirSync(ARTIFACTS_DIR);
  LOGGER.debug('Temporary artifacts directory cleared.');
};

const sendJUnitTestResults = async (
  owner: string,
  repo: string,
  workflowRunId: number,
  buildId: string,
  jobId: string,
  serverId: string
) => {
  LOGGER.info('Processing JUnit test results...');
  await processArtifacts(owner, repo, workflowRunId);

  const unitTestResultPattern = getConfig().unitTestResultsGlobPattern;
  LOGGER.debug(`JUnit test result pattern: ${unitTestResultPattern}`);
  const reportFiles = await findReportFiles(unitTestResultPattern);

  await sendTestResults(
    reportFiles,
    convertJUnitXMLToOctaneXML,
    serverId,
    buildId,
    jobId
  );
  LOGGER.info('JUnit test results processed and sent successfully.');
};

const sendGherkinTestResults = async (
  owner: string,
  repo: string,
  workflowRunId: number,
  buildId: string,
  jobId: string,
  serverId: string,
  framework: string
) => {
  LOGGER.info('Processing Gherkin test results...');
  await processArtifacts(owner, repo, workflowRunId);

  const gherkinTestResultPattern = getConfig().gherkinTestResultsGlobPattern;
  LOGGER.debug(`Gherkin test result pattern: ${gherkinTestResultPattern}`);
  const reportFiles = await findReportFiles(gherkinTestResultPattern);

  await sendTestResults(
    reportFiles,
    convertGherkinXMLToOctaneXML,
    serverId,
    buildId,
    jobId,
    [framework]
  );
  LOGGER.info('Gherkin test results processed and sent successfully.');
};

export { sendJUnitTestResults, sendGherkinTestResults };
