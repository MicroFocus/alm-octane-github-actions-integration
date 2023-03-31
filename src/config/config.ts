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

import { getInput } from '@actions/core';

interface Config {
  octaneUrl: string;
  octaneSharedSpace: number;
  octaneWorkspace: number;
  octaneClientId: string;
  octaneClientSecret: string;
  githubToken: string;
  serverBaseUrl: string;
  unitTestResultsGlobPattern: string;
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
    unitTestResultsGlobPattern: getInput('unitTestResultsGlobPattern')
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
