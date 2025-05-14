/*
 * Copyright 2022-2025 Open Text.
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

import { getInput } from '@actions/core';

interface Config {
  octaneUrl: string;
  octaneSharedSpace: number;
  octaneWorkspace: number;
  octaneClientId: string;
  octaneClientSecret: string;
  githubToken: string;
  serverBaseUrl: string;
  pipelineNamePattern: string;
  testingFramework: string;
  unitTestResultsGlobPattern: string;
  gherkinTestResultsGlobPattern: string;
  logLevel: number;
}

let config: Config | undefined;
let errorLoadingConfig: string;

try {
  config = {
    octaneUrl: getInput('octaneUrl'),
    octaneSharedSpace: Number.parseInt(getInput('octaneSharedSpace')),
    octaneWorkspace: Number.parseInt(getInput('octaneWorkspace')),
    octaneClientId: getInput('octaneClientId'),
    octaneClientSecret: getInput('octaneClientSecret'),
    githubToken: getInput('githubToken'),
    serverBaseUrl: getInput('serverBaseUrl'),
    pipelineNamePattern: getInput('pipelineNamePattern'),
    testingFramework: getInput('testingFramework'),
    unitTestResultsGlobPattern: getInput('unitTestResultsGlobPattern'),
    gherkinTestResultsGlobPattern: getInput('gherkinTestResultsGlobPattern'),
    logLevel: Number.parseInt(getInput('logLevel'))
  };
} catch (error: any) {
  errorLoadingConfig = error.message;
}

const getConfig = (): Config => {
  if (!config && errorLoadingConfig) {
    throw { message: errorLoadingConfig };
  } else if (!config) {
    throw { message: 'Config could not be loaded.' };
  }
  return config;
};

const setConfig = (newConfig: Config) => {
  config = newConfig;
};

export { getConfig, setConfig };
