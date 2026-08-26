module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: { jasmine: {}, clearContext: false },
    jasmineHtmlReporter: { suppressAll: true },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/entity-map'),
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }],
    },
    reporters: ['progress', 'kjhtml'],
    browsers: ['Chrome'],
    // CI has no sandbox available to the Chrome process.
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu'],
      },
    },
    // Hardening against a launcher/disconnect flake observed during Task 4: a run hung
    // for ~14 minutes with zero specs executed, then ChromeHeadless disconnected; an
    // immediate retry passed in under a second. These bounds make that failure mode
    // fail fast and self-heal once instead of hanging for the length of the CI timeout.
    // captureTimeout: generous ceiling for the browser process to start and report back
    // to Karma. 2 minutes comfortably covers a slow/loaded CI runner while remaining
    // nowhere near the 14-minute hang this is meant to catch.
    captureTimeout: 120000,
    // browserDisconnectTimeout: how long Karma waits for a reconnect before declaring
    // the browser disconnected. Raised from the 2s default so a brief network/IPC
    // hiccup between the browser and the Karma server doesn't get misread as a hard
    // disconnect.
    browserDisconnectTimeout: 10000,
    // browserNoActivityTimeout: max silence from the browser once it has connected
    // before Karma gives up on it. 69 specs finish in seconds even on a slow runner, so
    // 60s is generous headroom while still failing in well under a minute instead of 14.
    browserNoActivityTimeout: 60000,
    // browserDisconnectTolerance: permits exactly one relaunch after a disconnect. This
    // matches the flake we actually saw -- one bad launch, then an instant pass on retry
    // -- without masking a browser that keeps dying, which would just relabel a real
    // failure as green. It does not touch failing assertions; a genuinely broken spec
    // still fails the run.
    browserDisconnectTolerance: 1,
    restartOnFileChange: true,
  });
};
