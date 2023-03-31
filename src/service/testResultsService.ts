/*
© Copyright 2023 Micro Focus or one of its affiliates.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
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
