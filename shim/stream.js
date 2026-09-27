'use strict';
// main.js takes Readable from 'stream' for one thing: the ddx-file://
// protocol handler streams a byte range of a vault file (Readable.toWeb).
// That handler is never registered here — electron.js exports no `protocol`,
// and main.js guards its registration with `if (protocol)` — so this only has
// to let the bundle resolve. A call that does reach it says why rather than
// failing somewhere less obvious.
export class Readable {
  static toWeb() {
    throw new Error('stream.Readable.toWeb: file streaming is not available in the browser build');
  }
}
export default { Readable };
