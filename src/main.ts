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

import { setFailed } from '@actions/core';
import { context } from '@actions/github';
import { handleEvent } from './eventHandler';

(async () => {
  try {
    const event = context.payload;
    await handleEvent(event);
  } catch (error: any) {
    let msg;
    if (error.response) {
      msg = `${error.response.status} - ${error.response.statusText}\nurl: ${error.response.config.url} - ${error.response.config.method}\n${error.response.data.description_translated}`;
    } else {
      msg = error.message;
    }
    setFailed(msg);
  }
})();
