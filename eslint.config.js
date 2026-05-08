const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,

  // 浏览器 JS（通过 <script> 标签加载，跨文件共享函数）
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        // 浏览器 API
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        localStorage: 'readonly', URLSearchParams: 'readonly',
        AudioContext: 'readonly', OfflineAudioContext: 'readonly',
        MediaRecorder: 'readonly', FileReader: 'readonly',
        Blob: 'readonly', URL: 'readonly', fetch: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        console: 'readonly', alert: 'readonly',
        location: 'readonly', history: 'readonly',
        DataView: 'readonly', ArrayBuffer: 'readonly',
        Uint8Array: 'readonly', Int16Array: 'readonly',
        // common.js 导出（被其他文件使用）
        API: 'readonly', blobToWav: 'readonly', fetchJSON: 'readonly',
        getParam: 'readonly', escapeHTML: 'readonly', tokenizeWords: 'readonly',
        writeStr: 'readonly', audioBufferToWav: 'readonly',
        // reading.js 导出（被 shadowing.js 和 HTML onclick 使用）
        currentScript: 'readonly', loadReading: 'readonly', toggleMode: 'readonly',
        updateTitle: 'readonly', renderParagraphs: 'readonly',
        openAiSheet: 'readonly', closeAiSheet: 'readonly',
        askGrammar: 'readonly', askChat: 'readonly',
        // shadowing.js 导出（被 reading.js 和 HTML onclick 使用）
        initShadowing: 'readonly', cleanupShadowing: 'readonly',
        saveProgress: 'readonly', loadProgress: 'readonly',
        renderSentence: 'readonly', prevSentence: 'readonly',
        nextSentence: 'readonly', jumpToSentence: 'readonly',
        openSentenceList: 'readonly', closeSentenceList: 'readonly',
        playOriginal: 'readonly', onTTSEnded: 'readonly',
        stopTTS: 'readonly', cycleSpeed: 'readonly',
        toggleRecording: 'readonly', startRecording: 'readonly',
        stopRecording: 'readonly', runASR: 'readonly',
        showComparison: 'readonly', hideComparison: 'readonly',
        buildDiff: 'readonly',
        // home.js 导出
        loadHome: 'readonly', openScenic: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-var': 'warn',
      'prefer-const': 'warn',
      'eqeqeq': 'warn',
    },
  },

  // Node.js 文件
  {
    files: ['server.js', 'scripts/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        process: 'readonly', __dirname: 'readonly', console: 'readonly',
        require: 'readonly', module: 'readonly', exports: 'readonly',
        Buffer: 'readonly', URL: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-var': 'warn',
      'prefer-const': 'warn',
      'eqeqeq': 'warn',
    },
  },

  { ignores: ['node_modules/', 'cache/', 'public/sw.js'] },
];
