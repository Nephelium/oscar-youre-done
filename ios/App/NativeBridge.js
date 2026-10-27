(function () {
  'use strict';
  // WKUIDelegate completes these local storage operations before returning.
  // Keep Android's existing synchronous error contract for save/delete.
  const sync = (method, args = []) => {
    const text = window.prompt('oscar-native:' + JSON.stringify({method, args}), '');
    if (text === null) throw Error('原生连接已中断，请重新打开应用。');
    const response = JSON.parse(text);
    if (response.error) throw Error(response.error);
    return response.value;
  };
  const send = (method, args) => window.webkit.messageHandlers.oscar.postMessage({method, args});
  const host = {platform:'ios', capabilities:{capture:false, video:false, image:true, overlay:false}};
  for (const name of ['status','listGames','readLicense','evidence','capturePreview','imagePreview','videoPreview','confirmImage','copyText'])
    host[name] = (...args) => sync(name, args);
  for (const name of ['saveGame','deleteGame']) host[name] = (...args) => {
    try { sync(name, args); return ''; } catch (error) { return error.message; }
  };
  for (const name of ['analyze','analyzeLive','cancelAnalysis','playMove','setAppearance','setMoveFeedback',
    'exportDocument','openSource','startCapture','captureAction','suggestCrop','openDuolingo',
    'selectVideo','seekVideo','prepareVideo','runVideo','cancelVideo','selectImage','recognizeImage'])
    host[name] = (...args) => send(name, args);
  window.SproutHost = Object.freeze(host);
})();
