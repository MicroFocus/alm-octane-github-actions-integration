/*
 * Copyright 2016-2023 Open Text.
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
import { convertJUnitXMLToOctaneXML } from '@microfocus/alm-octane-test-result-convertion';
import fsExtra from 'fs-extra';
import glob from 'glob-promise';
import GitHubClient from '../client/githubClient';
import OctaneClient from '../client/octaneClient';
import { getConfig } from '../config/config';

const ARTIFACTS_DIR = 'artifacts';

const sendJUnitTestResults = async (
  owner: string,
  repo: string,
  workflowRunId: number,
  buildId: string,
  jobId: string,
  serverId: string
) => {
  console.log('Searching for test results...');
  const unitTestResultPattern = getConfig().unitTestResultsGlobPattern;
  if (!unitTestResultPattern) {
    throw new Error('Unit Test Results file pattern is not configured!');
  }

  const runArtifacts = await GitHubClient.getWorkflowRunArtifacts(
    owner,
    repo,
    workflowRunId
  );

  fsExtra.ensureDirSync(ARTIFACTS_DIR);

  for (const artifact of runArtifacts) {
    const fileName = `${ARTIFACTS_DIR}/${artifact.name}.zip`;

    console.log(`Downloading artifact ${artifact.name}...`);
    const artifactZipBytes = await GitHubClient.downloadArtifact(
      owner,
      repo,
      artifact.id
    );
    fsExtra.writeFileSync(fileName, Buffer.from(artifactZipBytes));

    const zip = new AdmZip(fileName);
    zip.extractAllTo(ARTIFACTS_DIR);

    fsExtra.rmSync(fileName);
  }

  const globSearchDestination = `${process.cwd()}/${ARTIFACTS_DIR}`;
  const reportFiles = await glob(unitTestResultPattern, {
    cwd: globSearchDestination
  });

  console.log(
    `Found ${reportFiles.length} test results according to pattern '${unitTestResultPattern}'`
  );

  console.log('Converting and sending test results to ALM Octane...');
  for (const reportFile of reportFiles) {
    const fileContent = fsExtra.readFileSync(
      `${ARTIFACTS_DIR}/${reportFile}`,
      'utf-8'
    );
    const convertedXML = convertJUnitXMLToOctaneXML(fileContent, {
      server_id: serverId,
      build_id: buildId,
      job_id: jobId
    });

    await OctaneClient.sendTestResult(convertedXML, serverId, jobId, buildId);
  }

  fsExtra.emptyDirSync(ARTIFACTS_DIR);
};

export { sendJUnitTestResults };
