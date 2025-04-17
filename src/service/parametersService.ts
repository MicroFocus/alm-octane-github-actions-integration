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
import fsExtra from 'fs-extra';
import CiParameter from '../dto/octane/events/CiParameter';
import GitHubClient from '../client/githubClient';
import { Logger } from '../utils/logger';
import glob from 'glob-promise';
import yaml from 'yaml';

const LOGGER: Logger = new Logger('parametersService');

const LOGS_DIR = 'logs';
const LOG_FILES_PATTERN = '*.txt';

const getParametersFromConfig = async (
  owner: string,
  repo: string,
  workflowFileName: string,
  branchName?: string
): Promise<CiParameter[]> => {
  let configParameters: CiParameter[] = [];

  const content = await getWorkflowFileContent(
    owner,
    repo,
    workflowFileName,
    branchName
  );
  if (!content) {
    return configParameters;
  }

  configParameters = parseYamlToCiParameters(content);

  return configParameters;
};

const getParametersFromLogs = async (
  owner: string,
  repo: string,
  workflowRunId: number
): Promise<CiParameter[]> => {
  let executionParameters: CiParameter[] = [];
  const logsDestination = `${process.cwd()}/${LOGS_DIR}`;

  const logFiles = await getWorkflowLogs(
    owner,
    repo,
    workflowRunId,
    logsDestination
  );
  if (!logFiles) {
    return executionParameters;
  }

  const serializedParameters = parseLogsToCiParameters(
    logFiles,
    logsDestination
  );
  if (!serializedParameters) {
    return executionParameters;
  }

  executionParameters = deserializeParameters(serializedParameters);

  return executionParameters;
};

const getWorkflowLogs = async (
  owner: string,
  repo: string,
  workflowRunId: number,
  logsDestination: string
): Promise<string[] | undefined> => {
  const logsFileName = `${LOGS_DIR}/workflow_logs.zip`;

  const logsArchiveUrl = await GitHubClient.getDownloadLogsUrl(
    owner,
    repo,
    workflowRunId
  );

  if (!logsArchiveUrl) {
    return undefined;
  }

  const response = await fetch(logsArchiveUrl);
  const logsZipBytes = await response.arrayBuffer();

  if (!fsExtra.existsSync(LOGS_DIR)) {
    LOGGER.debug(
      `Creating a directory for log files with {path='${LOGS_DIR}'}...`
    );
    fsExtra.mkdirSync(LOGS_DIR);
  }

  fsExtra.writeFileSync(logsFileName, new Uint8Array(logsZipBytes));

  const zip = new AdmZip(logsFileName);
  zip.extractAllTo(LOGS_DIR);

  fsExtra.rmSync(logsFileName);

  const logFiles = await glob(LOG_FILES_PATTERN, {
    cwd: logsDestination
  });

  LOGGER.info(
    `Found ${logFiles.length} log files according to pattern '${LOG_FILES_PATTERN}'.`
  );
  LOGGER.trace(`Search path: '${logsDestination}'`);

  return logFiles;
};

const parseLogsToCiParameters = (
  logFiles: string[],
  logsDestination: string
): string | undefined => {
  const datePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z execution_parameter:: .*/;
  const partToReplace =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z execution_parameter:: /;
  let executionParameters = undefined;

  LOGGER.info('Parsing and sending the parameters to OpenText SDP / SDM...');
  for (const logFile of logFiles) {
    const fileContent = fsExtra.readFileSync(
      `${logsDestination}/${logFile}`,
      'utf-8'
    );

    const lines = fileContent.split('\n');
    for (const line of lines) {
      if (datePattern.test(line)) {
        executionParameters = line.replace(partToReplace, '');
        LOGGER.debug(`Found execution parameters: ${executionParameters}`);
        break;
      }
    }

    if (executionParameters) {
      break;
    }
  }

  fsExtra.emptyDirSync(LOGS_DIR);

  return executionParameters;
};

const deserializeParameters = (serializedParameters: string): CiParameter[] => {
  const parameters: CiParameter[] = [];
  const parsedParameters = JSON.parse(serializedParameters);

  for (const [key, value] of Object.entries(parsedParameters)) {
    const stringValue =
      typeof value === 'object' ? JSON.stringify(value) : String(value);
    parameters.push({
      name: key,
      value: String(stringValue),
      defaultValue: '',
      choices: [],
      description: '',
      type: 'string'
    });
    LOGGER.debug(
      `Found parameter in log files with {name='${key}', value='${stringValue}'}.`
    );
  }

  return parameters;
};

const getWorkflowFileContent = async (
  owner: string,
  repo: string,
  workflowFileName: string,
  branchName?: string
): Promise<string | undefined> => {
  const fileContent = await GitHubClient.getWorkflowFile(
    owner,
    repo,
    workflowFileName,
    branchName
  );
  if (fileContent.encoding !== 'base64') {
    LOGGER.error(
      `The content of the workflow's configuration file has an unknown encoding: ${fileContent.encoding}`
    );
    return undefined;
  }

  LOGGER.debug(`Decoding the content of the workflow's configuration file...`);
  let singleLineContent = fileContent.content.replace(/\n/g, '');
  let decodedContent = Buffer.from(singleLineContent, 'base64').toString(
    'utf-8'
  );

  return decodedContent;
};

const parseYamlToCiParameters = (yamlContent: string): CiParameter[] => {
  const ciParameters: CiParameter[] = [];
  const parsedObject = yaml.parse(yamlContent);
  if (!parsedObject) {
    return ciParameters;
  }

  const onSection = parsedObject.on;
  if (!onSection) {
    return ciParameters;
  }

  const workflowDispatchSection = onSection.workflow_dispatch;
  if (!workflowDispatchSection) {
    return ciParameters;
  }

  const inputs = workflowDispatchSection.inputs;
  if (!inputs) {
    return ciParameters;
  }

  for (const [name, details] of Object.entries(inputs)) {
    const inputDetails = details as {
      description: string;
      default: string;
      options: string[];
      type: string;
    };
    const ciParameter: CiParameter = {
      name: name,
      description: inputDetails.description,
      defaultValue: inputDetails.default,
      choices: inputDetails.options,
      type: 'string'
    };
    ciParameters.push(ciParameter);
    LOGGER.debug(
      `Found parameter in configuration file with ${JSON.stringify(ciParameter)}.`
    );
  }

  return ciParameters;
};

export { getParametersFromConfig, getParametersFromLogs };
